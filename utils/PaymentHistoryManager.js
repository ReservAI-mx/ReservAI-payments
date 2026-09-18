const CreatePaymentHistoryInDB = require('../queries/CreatePaymentHistoryInDB');
const PaymentHistory = require('../models/paymentHistory');

class PaymentHistoryManager {
    static async createPaymentHistoryInDB(paymentHistory, db) {
        try {
            const paymentData = paymentHistory.toJSON();
            const result = await db.query(CreatePaymentHistoryInDB, [
                paymentData.id,
                paymentData.stripe_subscription_id,
                paymentData.stripe_invoice_id,
                paymentData.status,
                paymentData.amount,
                paymentData.ticket_pdf,
                paymentData.stripe_invoice_url,
                paymentData.created_at,
                paymentData.stripe_customer_id || null,
                paymentData.stripe_checkout_session_id || null,
            ]);
            return {
                success: true,
                message: 'Payment history created successfully',
                payment: result.rows[0]
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error creating payment history',
                error: error.message
            }
        }
    }
}

module.exports = PaymentHistoryManager;
