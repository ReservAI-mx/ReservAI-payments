const CustomerInfo = require('../models/customerInfo');
const Subscription = require('../models/subscription');
const PaymentHistory = require('../models/paymentHistory');
const { connectDB } = require('../data/connectDB');
const CustomersManager = require('../utils/CustomersManager');
const SubscriptionManager = require('../utils/SubscriptionManager');
const PaymentHistoryManager = require('../utils/PaymentHistoryManager');
const EmailContentManager = require('../utils/EmailContentManager');
const EmailManager = require('../utils/EmailManager');
const PaymentFailedAlertManager = require('../utils/PaymentFailedAlertManager');
const SetupPaidAlertManager = require('../utils/SetupPaidAlertManager');
const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const PaymentFanout = require('../utils/PaymentFanout');
const ProvisionFanout = require('../utils/ProvisionFanout');
const InvoiceManager = require('../utils/InvoiceManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const SetupProvisionManager = require('../utils/SetupProvisionManager');
const { captureOpsError, captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

async function flushTraceIfError(req, res) {
    if (req.trace && req.trace.hasError()) {
        await req.trace.flush(res.statusCode).catch(() => {});
    }
}

function webhookCtx(event, phase, extra = {}) {
    return { area: 'webhook', phase, event_type: event?.type, ...extra };
}

const WebhooksRouter = async (req, res) => {
    const event = req.event;
    res.status(200).json({ received: true });
    let db = null;
    let eventData = null; // Variable para almacenar la instancia creada (Subscription o PaymentHistory)
    let setupPaidInserted = false;
    let cfdiDocumentsEmailSent = false;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'WebhooksRouter', `connectDB type=${event?.type}`, error);
        captureOpsError(error, webhookCtx(event, 'webhook.connectDB'));
        await flushTraceIfError(req, res);
        return;
    }
    // Procesar el evento de forma asíncrona
    try {
        
        // Manejar solo los tipos de eventos necesarios
        switch (event.type) {

            case 'customer.created':
                const customer = CustomerInfo.fromStripeObject(event.data.object);
                const result = await CustomersManager.createCustomerInDB(customer.account_id, customer.stripe_customer_id, db);
                if (result.error) {
                    logAction(req, 'error', 'WebhooksRouter', `customer.created account=${customer.account_id}`);
                    captureStripeFailure(result.error, webhookCtx(event, 'webhook.customer.created'));
                    break;
                }
                logAction(req, 'info', 'WebhooksRouter', `customer.created ok account=${customer.account_id}`);
                break;

            case 'customer.subscription.created':
                try {
                    const subscription = Subscription.fromStripeObject(event.data.object);
                    eventData = subscription; // Guardar la instancia para el email
                    const result = await SubscriptionManager.createSubscriptionInDB(subscription, db);
                    if (!result.success) {
                        logAction(req, 'error', 'WebhooksRouter', `subscription.created sub=${subscription.stripe_subscription_id}`);
                        captureStripeFailure(
                            result.error || 'createSubscriptionInDB failed',
                            webhookCtx(event, 'webhook.subscription.created')
                        );
                        break;
                    }
                    if (subscription.technical_info_id) {
                        await TechnicalInfoManager.linkSubscription(
                            subscription.technical_info_id,
                            subscription.stripe_subscription_id,
                            db
                        );
                        await TechnicalInfoManager.setStatus(
                            subscription.technical_info_id,
                            'active',
                            db
                        );
                    }
                    await PaymentFanout.notifyBySubscriptionId(
                        subscription.stripe_subscription_id,
                        'ok',
                        db
                    );
                    logAction(req, 'info', 'WebhooksRouter', `subscription.created ok sub=${subscription.stripe_subscription_id}`);
                } catch (error) {
                    logAction(req, 'error', 'WebhooksRouter', 'subscription.created', error);
                    captureOpsError(error, webhookCtx(event, 'webhook.subscription.created'));
                }
                break;
                
            case 'customer.subscription.updated':
                try {
                    const stripeSubscription = event.data.object;
                    const previousAttributes = event.data.previous_attributes || {};
                    let shouldUpdate = false;
                    
                    // Caso 1: Se solicita cancelación (cancellation_details.reason === 'cancellation_requested')
                    if (stripeSubscription.cancellation_details?.reason === 'cancellation_requested') {
                        stripeSubscription.cancel_at_period_end = true;
                        shouldUpdate = true;
                    }
                    // Caso 2: Se cancela la cancelación (reactivación)
                    // cancel_at_period_end es false Y cancellation_details.reason es null Y antes había cancellation_requested
                    else if (
                        stripeSubscription.cancel_at_period_end === false &&
                        (!stripeSubscription.cancellation_details?.reason || stripeSubscription.cancellation_details.reason === null) &&
                        previousAttributes.cancellation_details?.reason === 'cancellation_requested'
                    ) {
                        stripeSubscription.cancel_at_period_end = false;
                        shouldUpdate = true;
                    }
                    
                    if (shouldUpdate) {
                        const subscription = Subscription.fromStripeObject(stripeSubscription);
                        eventData = subscription; // Guardar la instancia para el email
                        const result = await SubscriptionManager.updateSubscriptionInDB(subscription, db);
                        if (!result.success) {
                            logAction(req, 'error', 'WebhooksRouter', `subscription.updated sub=${subscription.stripe_subscription_id}`);
                            captureStripeFailure(
                                result.error || 'updateSubscriptionInDB failed',
                                webhookCtx(event, 'webhook.subscription.updated')
                            );
                        } else {
                            logAction(req, 'info', 'WebhooksRouter', `subscription.updated ok sub=${subscription.stripe_subscription_id}`);
                        }
                        const fanoutTenant = await TechnicalInfoManager.getForFanout(
                            subscription.stripe_subscription_id,
                            db
                        );
                        const techId = fanoutTenant.tenant?.id || subscription.technical_info_id;
                        if (techId) {
                            if (stripeSubscription.cancel_at_period_end) {
                                await ProvisionFanout.notify(techId, 'disable_renewal', db);
                            } else {
                                await ProvisionFanout.notify(techId, 'enable_renewal', db);
                            }
                        }
                    }
                } catch (error) {
                    logAction(req, 'error', 'WebhooksRouter', 'subscription.updated', error);
                    captureOpsError(error, webhookCtx(event, 'webhook.subscription.updated'));
                }
                break;
                
            case 'customer.subscription.deleted':
                try {
                    const subscription = Subscription.fromStripeObject(event.data.object);
                    eventData = subscription; // Guardar la instancia para el email
                    const subscriptionId = subscription.stripe_subscription_id;
                    const customerId = subscription.stripe_customer_id;
                    
                    const result = await SubscriptionManager.updateSubscriptionOnCancellation(
                        customerId,
                        subscriptionId,
                        db
                    );
                    if (!result.success) {
                        logAction(req, 'error', 'WebhooksRouter', `subscription.deleted sub=${subscriptionId}`);
                        captureStripeFailure(
                            result.error || 'updateSubscriptionOnCancellation failed',
                            webhookCtx(event, 'webhook.subscription.deleted')
                        );
                    }
                    await TechnicalInfoManager.setStatusBySubscriptionId(
                        subscriptionId,
                        'unpaid',
                        db
                    );
                    await PaymentFanout.notifyBySubscriptionId(subscriptionId, 'unpaid', db);
                    const fanoutTenant = await TechnicalInfoManager.getForFanout(subscriptionId, db);
                    if (fanoutTenant.tenant?.id) {
                        await ProvisionFanout.notify(fanoutTenant.tenant.id, 'disable_renewal', db);
                    }
                    if (result.success) {
                        logAction(req, 'info', 'WebhooksRouter', `subscription.deleted ok sub=${subscriptionId}`);
                    }
                } catch (error) {
                    logAction(req, 'error', 'WebhooksRouter', `subscription.deleted sub=${subscriptionId}`, error);
                    captureOpsError(error, webhookCtx(event, 'webhook.subscription.deleted'));
                }
                break;
                
            case 'invoice.payment_succeeded':
                try {
                    const invoice = event.data.object;
                    const paymentHistory = PaymentHistory.fromStripeInvoice(invoice);
                    const subscriptionId = process.env.LOCAL_FANOUT_SUBSCRIPTION_ID || paymentHistory.stripe_subscription_id;
                    
                    // Si el invoice tiene una suscripción asociada, actualizar los períodos
                    if (!subscriptionId) {
                        logAction(req, 'info', 'WebhooksRouter', `payment_succeeded no-sub invoice=${invoice.id}`);
                    }
                    if (subscriptionId) {
                        const customerId = invoice.customer;
                        const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000) : null;
                        const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : null;
                        
                        if (periodStart && periodEnd) {
                            const result = await SubscriptionManager.updateSubscriptionOnPaymentSuccess(
                                customerId,
                                subscriptionId,
                                periodStart,
                                periodEnd,
                                db
                            );
                            if (!result.success) {
                                logAction(req, 'error', 'WebhooksRouter', `payment_succeeded sub=${subscriptionId}`);
                                captureStripeFailure(
                                    result.error || 'updateSubscriptionOnPaymentSuccess failed',
                                    webhookCtx(event, 'webhook.payment_succeeded')
                                );
                            }
                        }
                        await TechnicalInfoManager.setStatusBySubscriptionId(
                            subscriptionId,
                            'active',
                            db
                        );
                        eventData = invoice;
                        const paymentResult = await PaymentHistoryManager.createPaymentHistoryInDB(paymentHistory, db);
                        if (!paymentResult.success) {
                            logAction(req, 'error', 'WebhooksRouter', `payment_succeeded history sub=${subscriptionId}`);
                            captureStripeFailure(
                                paymentResult.error || 'createPaymentHistoryInDB failed',
                                webhookCtx(event, 'webhook.payment_succeeded.history')
                            );
                        } else {
                            try {
                                const accountLookup =
                                    await InvoiceManager.getAccountAndPlanBySubscriptionId(
                                        subscriptionId,
                                        db
                                    );
                                const accountId = accountLookup.row?.account_id;
                                if (accountId) {
                                    const paymentId =
                                        paymentResult.payment?.id || paymentHistory.id;
                                    const customerLookup =
                                        await CustomersManager.getCustomersEmailAndName(
                                            customerId,
                                            db
                                        );
                                    const auto = await InvoiceManager.notifyPaymentDocuments({
                                        accountId,
                                        paymentHistoryId: paymentId,
                                        customerEmail: customerLookup.success
                                            ? customerLookup.email
                                            : null,
                                        customerName: customerLookup.success
                                            ? customerLookup.name
                                            : null,
                                        stripePdfUrl:
                                            invoice.invoice_pdf || paymentHistory.ticket_pdf,
                                        meta: {
                                            amount_paid: invoice.amount_paid,
                                            number: invoice.number,
                                            currency: invoice.currency,
                                            hosted_invoice_url: invoice.hosted_invoice_url,
                                            invoice_pdf: invoice.invoice_pdf,
                                            period_start: invoice.period_start,
                                            period_end: invoice.period_end,
                                        },
                                        plannedPlan: accountLookup.row?.planned_plan || null,
                                        db,
                                    });
                                    if (auto.emailed) {
                                        cfdiDocumentsEmailSent = true;
                                    } else if (auto.error) {
                                        logAction(req, 'error', 'WebhooksRouter', `payment_succeeded cfdi sub=${subscriptionId}`);
                                        captureStripeFailure(
                                            auto.error,
                                            webhookCtx(event, 'webhook.payment_succeeded.cfdi')
                                        );
                                    } else if (auto.skipped) {
                                        logAction(req, 'info', 'WebhooksRouter', `payment_succeeded cfdi skipped reason=${auto.reason} sub=${subscriptionId}`);
                                    }
                                }
                            } catch (cfdiError) {
                                logAction(req, 'error', 'WebhooksRouter', `payment_succeeded cfdi sub=${subscriptionId}`, cfdiError);
                                captureOpsError(
                                    cfdiError,
                                    webhookCtx(event, 'webhook.payment_succeeded.cfdi')
                                );
                            }
                        }
                        await PaymentFanout.notifyBySubscriptionId(subscriptionId, 'ok', db);
                        const cancelLookup = await SubscriptionManager.getCancelAtPeriodEnd(
                            subscriptionId,
                            db
                        );
                        if (cancelLookup.cancel_at_period_end) {
                            logAction(req, 'info', 'WebhooksRouter', `skip enable_renewal cancel_at_period_end sub=${subscriptionId}`);
                        } else {
                            const fanoutTenant = await TechnicalInfoManager.getForFanout(
                                subscriptionId,
                                db
                            );
                            if (fanoutTenant.tenant?.id) {
                                const fanout = await ProvisionFanout.notify(
                                    fanoutTenant.tenant.id,
                                    'enable_renewal',
                                    db
                                );
                                logAction(req, 'info', 'WebhooksRouter', `enable_renewal tenant=${fanoutTenant.tenant.id} sub=${subscriptionId} ok=${!!fanout.success}`);
                            } else {
                                logAction(req, 'info', 'WebhooksRouter', `skip enable_renewal no tenant sub=${subscriptionId}`);
                            }
                        }
                    }
                } catch (error) {
                    logAction(req, 'error', 'WebhooksRouter', 'payment_succeeded', error);
                    captureOpsError(error, webhookCtx(event, 'webhook.payment_succeeded'));
                }
                break;
                
            case 'invoice.payment_failed':
                try {
                    const invoice = event.data.object;
                    const paymentHistory = PaymentHistory.fromStripeInvoice(invoice);
                    const subscriptionId = process.env.LOCAL_FANOUT_SUBSCRIPTION_ID || paymentHistory.stripe_subscription_id;
                    
                    // Si el invoice tiene una suscripción asociada, actualizar el estado
                    if (subscriptionId) {
                        const customerId = invoice.customer;
                        
                        const result = await SubscriptionManager.updateSubscriptionOnPaymentFailed(
                            customerId,
                            subscriptionId,
                            'unpaid',
                            db
                        );
                        if (!result.success) {
                            logAction(req, 'error', 'WebhooksRouter', `payment_failed sub=${subscriptionId}`);
                            captureStripeFailure(
                                result.error || 'updateSubscriptionOnPaymentFailed failed',
                                webhookCtx(event, 'webhook.payment_failed')
                            );
                        }
                        await TechnicalInfoManager.setStatusBySubscriptionId(
                            subscriptionId,
                            'unpaid',
                            db
                        );
                        eventData = invoice;
                        const paymentResult = await PaymentHistoryManager.createPaymentHistoryInDB(paymentHistory, db);
                        if (!paymentResult.success) {
                            logAction(req, 'error', 'WebhooksRouter', `payment_failed history sub=${subscriptionId}`);
                            captureStripeFailure(
                                paymentResult.error || 'createPaymentHistoryInDB failed',
                                webhookCtx(event, 'webhook.payment_failed.history')
                            );
                        }
                        await PaymentFanout.notifyBySubscriptionId(subscriptionId, 'unpaid', db);
                        const fanoutTenant = await TechnicalInfoManager.getForFanout(
                            subscriptionId,
                            db
                        );
                        if (fanoutTenant.tenant?.id) {
                            const fanout = await ProvisionFanout.notify(
                                fanoutTenant.tenant.id,
                                'disable_renewal',
                                db
                            );
                            logAction(req, 'info', 'WebhooksRouter', `disable_renewal tenant=${fanoutTenant.tenant.id} sub=${subscriptionId} ok=${!!fanout.success}`);
                        } else {
                            logAction(req, 'info', 'WebhooksRouter', `skip disable_renewal no tenant sub=${subscriptionId}`);
                        }
                    }
                } catch (error) {
                    logAction(req, 'error', 'WebhooksRouter', 'payment_failed', error);
                    captureOpsError(error, webhookCtx(event, 'webhook.payment_failed'));
                }
                break;
                
            case 'checkout.session.completed':
                try {
                    const session = event.data.object;
                    const metadata = session.metadata || {};
                    logAction(req, 'info', 'WebhooksRouter', `checkout.session.completed id=${session.id} kind=${metadata.kind || '-'} subdomain=${metadata.subdomain || '-'}`);
                    if (metadata.kind !== 'setup') {
                        logAction(req, 'info', 'WebhooksRouter', 'skip provision kind');
                        break;
                    }
                    const setup = await SetupProvisionManager.handleSetupPaid(session, db);
                    setupPaidInserted = Boolean(setup.inserted);
                    if (setup.eventData) eventData = setup.eventData;
                    logAction(req, 'info', 'WebhooksRouter', `checkout tenant=${setup.tenant ? setup.tenant.id : 'null'} status=${setup.tenant?.status || '-'}`);
                    // Cobro setup: payment_history + CFDI (mismo criterio que suscripción)
                    try {
                        let invoiceExtras = {};
                        const invoiceRef =
                            typeof session.invoice === 'string'
                                ? session.invoice
                                : session.invoice?.id || null;
                        if (invoiceRef) {
                            try {
                                const stripe = await getStripeInstance();
                                const inv = await stripe.invoices.retrieve(invoiceRef);
                                invoiceExtras = {
                                    invoice_pdf: inv.invoice_pdf || null,
                                    hosted_invoice_url: inv.hosted_invoice_url || null,
                                    number: inv.number || null,
                                };
                            } catch (invErr) {
                                logAction(req, 'error', 'WebhooksRouter', `checkout invoice cs=${session.id}`, invErr);
                                captureStripeFailure(
                                    invErr.message || 'retrieve setup invoice failed',
                                    webhookCtx(event, 'webhook.checkout.invoice')
                                );
                            }
                        }

                        const setupPayment = PaymentHistory.fromStripeCheckoutSession(
                            session,
                            invoiceExtras
                        );
                        const paymentResult =
                            await PaymentHistoryManager.createPaymentHistoryInDB(
                                setupPayment,
                                db
                            );
                        if (!paymentResult.success) {
                            const dup =
                                /unique|duplicate/i.test(String(paymentResult.error || ''));
                            if (!dup) {
                                logAction(req, 'error', 'WebhooksRouter', `checkout history cs=${session.id}`);
                                captureStripeFailure(
                                    paymentResult.error || 'setup payment_history failed',
                                    webhookCtx(event, 'webhook.checkout.history')
                                );
                            }
                        } else if (metadata.account_id) {
                            const customerLookup =
                                await CustomersManager.getCustomersEmailAndName(
                                    session.customer,
                                    db
                                );
                            const auto = await InvoiceManager.notifyPaymentDocuments({
                                accountId: metadata.account_id,
                                paymentHistoryId:
                                    paymentResult.payment?.id || setupPayment.id,
                                customerEmail: customerLookup.success
                                    ? customerLookup.email
                                    : null,
                                customerName: customerLookup.success
                                    ? customerLookup.name
                                    : null,
                                stripePdfUrl:
                                    invoiceExtras.invoice_pdf || setupPayment.ticket_pdf,
                                meta: {
                                    amount_paid: session.amount_total,
                                    number: invoiceExtras.number || session.id,
                                    currency: session.currency,
                                    hosted_invoice_url: invoiceExtras.hosted_invoice_url,
                                    invoice_pdf: invoiceExtras.invoice_pdf,
                                },
                                plannedPlan: metadata.planned_plan || null,
                                db,
                            });
                            if (auto.emailed) {
                                cfdiDocumentsEmailSent = true;
                            } else if (auto.error) {
                                logAction(req, 'error', 'WebhooksRouter', `checkout cfdi cs=${session.id}`);
                                captureStripeFailure(
                                    auto.error,
                                    webhookCtx(event, 'webhook.checkout.cfdi')
                                );
                            } else if (auto.skipped) {
                                logAction(req, 'info', 'WebhooksRouter', `checkout cfdi skipped reason=${auto.reason} cs=${session.id}`);
                            }
                        }
                    } catch (setupBillErr) {
                        logAction(req, 'error', 'WebhooksRouter', `checkout billing cs=${session.id}`, setupBillErr);
                        captureOpsError(
                            setupBillErr,
                            webhookCtx(event, 'webhook.checkout.billing')
                        );
                    }
                } catch (error) {
                    logAction(req, 'error', 'WebhooksRouter', 'checkout.session.completed', error);
                    captureOpsError(error, webhookCtx(event, 'webhook.checkout.session.completed'));
                }
                break;

            default:
                // Evento no manejado - no imprimir nada
                break;
        }
        
    } catch (error) {
        logAction(req, 'error', 'WebhooksRouter', `switch type=${event?.type}`, error);
        captureOpsError(error, webhookCtx(event, 'webhook.switch'));
    }
    
    let customerInfo = null;

    // Enviar email al cliente (excepto para customer.created)
    try {
        if (event.type !== 'customer.created') {
            const eventObject = event.data.object;

            if (eventObject?.customer) {
                const customerId = typeof eventObject.customer === 'string'
                    ? eventObject.customer
                    : eventObject.customer.id || eventObject.customer;

                if (customerId) {
                    const lookup = await CustomersManager.getCustomersEmailAndName(customerId, db);
                    if (lookup.success) {
                        customerInfo = lookup;
                    }
                }
            }

            if (customerInfo && eventData && !cfdiDocumentsEmailSent) {
                let emailData = null;
                if (eventData instanceof Subscription) {
                    const subscriptionJSON = eventData.toJSON();
                    emailData = {
                        plan_name: subscriptionJSON.plan_name,
                        amount: subscriptionJSON.amount * 100,
                        current_period_start: subscriptionJSON.current_period_start instanceof Date
                            ? Math.floor(subscriptionJSON.current_period_start.getTime() / 1000)
                            : subscriptionJSON.current_period_start,
                        current_period_end: subscriptionJSON.current_period_end instanceof Date
                            ? Math.floor(subscriptionJSON.current_period_end.getTime() / 1000)
                            : subscriptionJSON.current_period_end,
                        status: subscriptionJSON.status
                    };
                } else {
                    emailData = eventData;
                }

                const emailContent = await EmailContentManager.getEmailContent(
                    customerInfo.name,
                    event.type,
                    emailData
                );

                if (emailContent) {
                    await EmailManager.sendEmailToCustomer(
                        customerInfo.email,
                        emailContent.subject,
                        emailContent.content,
                        emailContent.text_content
                    );
                }
            }
        }
    } catch (error) {
        logAction(req, 'error', 'WebhooksRouter', `email type=${event?.type}`, error);
        captureOpsError(error, webhookCtx(event, 'webhook.email'));
    }

    try {
        if (event.type === 'invoice.payment_failed' || event.type === 'payment_intent.payment_failed') {
            await PaymentFailedAlertManager.notifyTeam(event, customerInfo);
        }
    } catch (error) {
        logAction(req, 'error', 'WebhooksRouter', 'paymentFailedAlert', error);
        captureOpsError(error, webhookCtx(event, 'webhook.paymentFailedAlert'));
    }

    try {
        if (setupPaidInserted) {
            await SetupPaidAlertManager.notifyTeam(event, customerInfo);
        }
    } catch (error) {
        logAction(req, 'error', 'WebhooksRouter', 'setupPaidAlert', error);
        captureOpsError(error, webhookCtx(event, 'webhook.setupPaidAlert'));
    }

    await flushTraceIfError(req, res);
    return;
}

module.exports = WebhooksRouter;