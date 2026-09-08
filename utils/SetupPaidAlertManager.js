const EmailContentManager = require('./EmailContentManager');
const EmailManager = require('./EmailManager');

class SetupPaidAlertManager {
    static shouldNotify(event) {
        return event?.type === 'checkout.session.completed'
            && event.data?.object?.metadata?.kind === 'setup';
    }

    static getStripeCustomerId(session) {
        if (!session?.customer) {
            return null;
        }
        return typeof session.customer === 'string'
            ? session.customer
            : session.customer.id || null;
    }

    static buildAlertData(session, customerInfo) {
        const metadata = session?.metadata || {};
        return {
            subdomain: metadata.subdomain || null,
            planned_plan: metadata.planned_plan || null,
            account_id: metadata.account_id || null,
            setup_session_id: session?.id || null,
            amount_total: Number.isFinite(session?.amount_total) ? session.amount_total : 0,
            currency: session?.currency || 'usd',
            customer_email: customerInfo?.email
                || session?.customer_details?.email
                || session?.customer_email
                || null,
            stripe_customer_id: this.getStripeCustomerId(session),
        };
    }

    static async notifyTeam(event, customerInfo) {
        if (!this.shouldNotify(event)) {
            return { success: false, skipped: true };
        }

        const session = event.data.object;
        const emailContent = await EmailContentManager.getInternalSetupPaidContent(
            customerInfo?.name || 'Desconocido',
            this.buildAlertData(session, customerInfo)
        );

        if (!emailContent) {
            return { success: false, error: 'No internal setup paid email content' };
        }

        return EmailManager.sendEmailToInternalTeam(
            emailContent.subject,
            emailContent.content,
            emailContent.text_content
        );
    }
}

module.exports = SetupPaidAlertManager;
