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
const VaultCrypto = require('../utils/VaultCrypto');
const crypto = require('crypto');
const uuid = require('uuid');
const { captureOpsError } = require('../utils/captureOpsError');



const WebhooksRouter = async (req, res) => {
    const event = req.event;
    res.status(200).json({ received: true });
    let db = null;
    let eventData = null; // Variable para almacenar la instancia creada (Subscription o PaymentHistory)
    let setupPaidInserted = false;
    try {
        db = await connectDB();
    } catch (error) {
        captureOpsError(error, { phase: 'webhook.connectDB', event_type: event?.type });
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
                    return;
                }
                break;

            case 'customer.subscription.created':
                try {
                    const subscription = Subscription.fromStripeObject(event.data.object);
                    eventData = subscription; // Guardar la instancia para el email
                    const result = await SubscriptionManager.createSubscriptionInDB(subscription, db);
                    if (!result.success) {
                        return;
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
                } catch (error) {
                    captureOpsError(error, { phase: 'webhook.subscription.created', event_type: event.type });
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
                            // Error actualizando suscripción en DB
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
                    captureOpsError(error, { phase: 'webhook.subscription.updated', event_type: event.type });
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
                        // Error actualizando suscripción cancelada en DB
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
                } catch (error) {
                    captureOpsError(error, { phase: 'webhook.subscription.deleted', event_type: event.type });
                }
                break;
                
            case 'invoice.payment_succeeded':
                try {
                    const invoice = event.data.object;
                    const paymentHistory = PaymentHistory.fromStripeInvoice(invoice);
                    const subscriptionId = process.env.LOCAL_FANOUT_SUBSCRIPTION_ID || paymentHistory.stripe_subscription_id;
                    
                    // Si el invoice tiene una suscripción asociada, actualizar los períodos
                    if (!subscriptionId) {
                        console.log('invoice.payment_succeeded no-sub', invoice.id);
                    }
                    if (subscriptionId) {
                        console.log('invoice.payment_succeeded', subscriptionId);
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
                                // Error actualizando suscripción en pago exitoso
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
                            // Error creando registro en payment_history
                        }
                        await PaymentFanout.notifyBySubscriptionId(subscriptionId, 'ok', db);
                        const cancelLookup = await SubscriptionManager.getCancelAtPeriodEnd(
                            subscriptionId,
                            db
                        );
                        if (cancelLookup.cancel_at_period_end) {
                            console.log(
                                `[stripe][webhook] skip enable_renewal cancel_at_period_end sub=${subscriptionId}`
                            );
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
                                console.log(
                                    `[stripe][webhook] enable_renewal tenant=${fanoutTenant.tenant.id} sub=${subscriptionId}`,
                                    fanout
                                );
                            } else {
                                console.log(
                                    `[stripe][webhook] skip enable_renewal no tenant sub=${subscriptionId}`
                                );
                            }
                        }
                    }
                } catch (error) {
                    captureOpsError(error, { phase: 'webhook.payment_succeeded', event_type: event.type });
                }
                break;
                
            case 'invoice.payment_failed':
                try {
                    const invoice = event.data.object;
                    const paymentHistory = PaymentHistory.fromStripeInvoice(invoice);
                    const subscriptionId = process.env.LOCAL_FANOUT_SUBSCRIPTION_ID || paymentHistory.stripe_subscription_id;
                    
                    // Si el invoice tiene una suscripción asociada, actualizar el estado
                    if (subscriptionId) {
                        console.log('invoice.payment_failed', subscriptionId);
                        const customerId = invoice.customer;
                        
                        const result = await SubscriptionManager.updateSubscriptionOnPaymentFailed(
                            customerId,
                            subscriptionId,
                            'unpaid',
                            db
                        );
                        if (!result.success) {
                            // Error actualizando suscripción en pago fallido
                        }
                        await TechnicalInfoManager.setStatusBySubscriptionId(
                            subscriptionId,
                            'unpaid',
                            db
                        );
                        eventData = invoice;
                        const paymentResult = await PaymentHistoryManager.createPaymentHistoryInDB(paymentHistory, db);
                        if (!paymentResult.success) {
                            // Error creando registro en payment_history
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
                            console.log(
                                `[stripe][webhook] disable_renewal tenant=${fanoutTenant.tenant.id} sub=${subscriptionId}`,
                                fanout
                            );
                        } else {
                            console.log(
                                `[stripe][webhook] skip disable_renewal no tenant sub=${subscriptionId}`
                            );
                        }
                    }
                } catch (error) {
                    captureOpsError(error, { phase: 'webhook.payment_failed', event_type: event.type });
                }
                break;
                
            case 'checkout.session.completed':
                try {
                    const session = event.data.object;
                    const metadata = session.metadata || {};
                    console.log(
                      `[stripe][webhook] checkout.session.completed id=${session.id} kind=${metadata.kind || '-'} subdomain=${metadata.subdomain || '-'}`
                    );
                    if (metadata.kind !== 'setup') {
                        console.log('[stripe][webhook] skip provision: kind !== setup');
                        break;
                    }
                    const inboundPlain = crypto.randomBytes(32).toString('hex');
                    const inboundBlob = VaultCrypto.encrypt(inboundPlain);
                    const inserted = await TechnicalInfoManager.insertFromSetupSession({
                        id: uuid.v4(),
                        account_id: metadata.account_id,
                        subdomain: metadata.subdomain,
                        planned_plan: metadata.planned_plan,
                        inbound_auth_key: inboundBlob,
                        setup_session_id: session.id,
                    }, db);
                    if (!inserted.success) {
                        console.error('[stripe][webhook] insert technical_info failed:', inserted.error);
                    }
                    setupPaidInserted = Boolean(inserted.success && inserted.tenant);
                    let tenant = inserted.tenant || null;
                    if (!tenant) {
                        const lookup = await TechnicalInfoManager.getBySetupSessionId(session.id, db);
                        if (!lookup.success) {
                            console.error('[stripe][webhook] lookup by setup_session failed:', lookup.error);
                        }
                        tenant = lookup.tenant || null;
                    }
                    console.log(
                      `[stripe][webhook] tenant=${tenant ? tenant.id : 'null'} status=${tenant?.status || '-'} provision_error=${tenant?.provision_error || '-'}`
                    );
                    if (
                        tenant
                        && tenant.status === 'pending_provision'
                        && !tenant.provision_error
                    ) {
                        const fanout = await ProvisionFanout.notify(tenant.id, 'provision', db);
                        console.log('[stripe][webhook] ProvisionFanout result', fanout);
                    } else {
                        console.log('[stripe][webhook] skip ProvisionFanout (tenant/status/error)');
                    }
                    if (setupPaidInserted) {
                        eventData = {
                            amount_total: session.amount_total,
                            currency: session.currency,
                            subdomain: metadata.subdomain,
                            planned_plan: metadata.planned_plan,
                        };
                    }
                } catch (error) {
                    console.error('[stripe][webhook] checkout.session.completed error:', error.message);
                    captureOpsError(error, { phase: 'webhook.checkout.session.completed', event_type: event.type });
                }
                break;

            default:
                // Evento no manejado - no imprimir nada
                break;
        }
        
    } catch (error) {
        captureOpsError(error, { phase: 'webhook.switch', event_type: event?.type });
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

            if (customerInfo && eventData) {
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
        captureOpsError(error, { phase: 'webhook.email', event_type: event?.type });
    }

    try {
        if (event.type === 'invoice.payment_failed' || event.type === 'payment_intent.payment_failed') {
            await PaymentFailedAlertManager.notifyTeam(event, customerInfo);
        }
    } catch (error) {
        captureOpsError(error, { phase: 'webhook.paymentFailedAlert', event_type: event?.type });
    }

    try {
        if (setupPaidInserted) {
            await SetupPaidAlertManager.notifyTeam(event, customerInfo);
        }
    } catch (error) {
        captureOpsError(error, { phase: 'webhook.setupPaidAlert', event_type: event?.type });
    }

    return;
}

module.exports = WebhooksRouter;