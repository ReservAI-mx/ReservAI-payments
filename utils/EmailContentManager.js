const SubscriptionCreatedMessage = require('../views/SubscriptionCreated');
const SubscriptionUpdatedMessage = require('../views/SubscriptionUpdated');
const SubscriptionCancelledMessage = require('../views/SubscriptionCancelled');
const PaymentSucceededMessage = require('../views/PaymentSucceeded');
const PaymentFailedMessage = require('../views/PaymentFailed');
const PaymentFailedInternalMessage = require('../views/PaymentFailedInternal');
const SetupPaidInternalMessage = require('../views/SetupPaidInternal');
const SetupPaidCustomerMessage = require('../views/SetupPaidCustomer');

class EmailContentManager {
    static async getEmailContent(name, event_type, event_data) {
        switch (event_type) {
            case 'customer.subscription.created':
                return SubscriptionCreatedMessage.getMessage(name, event_data);
                
            case 'customer.subscription.updated':
                return SubscriptionUpdatedMessage.getMessage(name, event_data);
                
            case 'customer.subscription.deleted':
                return SubscriptionCancelledMessage.getMessage(name, event_data);
                
            case 'invoice.payment_succeeded':
                return PaymentSucceededMessage.getMessage(name, event_data);
                
            case 'invoice.payment_failed':
                return PaymentFailedMessage.getMessage(name, event_data);

            case 'checkout.session.completed':
                return SetupPaidCustomerMessage.getMessage(name, event_data);
                
            default:
                return null;
        }
    }

    static async getInternalPaymentFailedContent(name, event_data) {
        return PaymentFailedInternalMessage.getMessage(name, event_data);
    }

    static async getInternalSetupPaidContent(name, event_data) {
        return SetupPaidInternalMessage.getMessage(name, event_data);
    }
}

module.exports = EmailContentManager;