const EmailContentManager = require('./EmailContentManager');
const EmailManager = require('./EmailManager');

class PaymentFailedAlertManager {
    static shouldNotify(event) {
        if (!event || !event.type) {
            return false;
        }

        if (event.type === 'invoice.payment_failed') {
            return true;
        }

        if (event.type === 'payment_intent.payment_failed') {
            return !event.data?.object?.invoice;
        }

        return false;
    }

    static getSubscriptionId(stripeObject) {
        if (!stripeObject) {
            return null;
        }

        if (stripeObject.subscription) {
            return typeof stripeObject.subscription === 'string'
                ? stripeObject.subscription
                : stripeObject.subscription.id || null;
        }

        const parentSubscription = stripeObject.parent?.subscription_details?.subscription;
        if (parentSubscription) {
            return typeof parentSubscription === 'string'
                ? parentSubscription
                : parentSubscription.id || null;
        }

        return null;
    }

    static getPaymentKind(event) {
        const stripeObject = event?.data?.object || {};
        if (event?.type === 'invoice.payment_failed' && this.getSubscriptionId(stripeObject)) {
            return 'suscripción';
        }
        return 'compra';
    }

    static getStripeCustomerId(stripeObject) {
        if (!stripeObject?.customer) {
            return null;
        }
        return typeof stripeObject.customer === 'string'
            ? stripeObject.customer
            : stripeObject.customer.id || null;
    }

    static buildAlertData(event, customerInfo) {
        const stripeObject = event?.data?.object || {};
        const isInvoice = event?.type === 'invoice.payment_failed' || stripeObject.object === 'invoice';
        const amountDue = isInvoice
            ? (stripeObject.amount_due || stripeObject.total || stripeObject.amount_paid || 0)
            : (stripeObject.amount || 0);

        return {
            payment_kind: this.getPaymentKind(event),
            customer_email: customerInfo?.email || stripeObject.receipt_email || stripeObject.customer_email || null,
            stripe_customer_id: this.getStripeCustomerId(stripeObject),
            amount_due: amountDue,
            currency: stripeObject.currency || 'usd',
            number: stripeObject.number || null,
            stripe_object_id: stripeObject.id || null,
            stripe_subscription_id: this.getSubscriptionId(stripeObject),
            last_payment_error_message: stripeObject.last_payment_error?.message
                || stripeObject.last_finalization_error?.message
                || null,
            hosted_invoice_url: stripeObject.hosted_invoice_url || null,
            invoice_pdf: stripeObject.invoice_pdf || null,
            period_start: stripeObject.period_start || null,
            period_end: stripeObject.period_end || null,
            next_payment_attempt: stripeObject.next_payment_attempt || null
        };
    }

    static async notifyTeam(event, customerInfo) {
        if (!this.shouldNotify(event)) {
            return { success: false, skipped: true };
        }

        const alertData = this.buildAlertData(event, customerInfo);
        const customerName = customerInfo?.name || 'Desconocido';
        const emailContent = await EmailContentManager.getInternalPaymentFailedContent(
            customerName,
            alertData
        );

        if (!emailContent) {
            return { success: false, error: 'No internal payment failed email content' };
        }

        return EmailManager.sendEmailToInternalTeam(
            emailContent.subject,
            emailContent.content,
            emailContent.text_content
        );
    }
}

module.exports = PaymentFailedAlertManager;
