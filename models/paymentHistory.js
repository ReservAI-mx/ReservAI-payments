const uuid = require('uuid');

class PaymentHistory {
    constructor(
        id = uuid.v4(),
        stripe_subscription_id,
        stripe_invoice_id = null,
        status,
        amount,
        ticket_pdf = null,
        created_at = new Date(),
        stripe_invoice_url = null,
        stripe_customer_id = null,
        stripe_checkout_session_id = null
    ) {
        this.id = id;
        this.stripe_subscription_id = stripe_subscription_id;
        this.stripe_invoice_id = stripe_invoice_id;
        this.status = status;
        this.amount = amount;
        this.ticket_pdf = ticket_pdf;
        this.stripe_invoice_url = stripe_invoice_url;
        this.created_at = created_at;
        this.stripe_customer_id = stripe_customer_id;
        this.stripe_checkout_session_id = stripe_checkout_session_id;
    }

    toJSON() {
        return {
            id: this.id,
            stripe_subscription_id: this.stripe_subscription_id,
            stripe_invoice_id: this.stripe_invoice_id,
            status: this.status,
            amount: this.amount,
            ticket_pdf: this.ticket_pdf,
            stripe_invoice_url: this.stripe_invoice_url,
            created_at: this.created_at,
            stripe_customer_id: this.stripe_customer_id,
            stripe_checkout_session_id: this.stripe_checkout_session_id,
        };
    }

    // Método estático para crear desde objeto de Stripe Invoice
    static fromStripeInvoice(stripeInvoice) {
        // Obtener el monto: primero amount_paid, luego amount_due, luego total
        let amount = 0;
        if (stripeInvoice.amount_paid && stripeInvoice.amount_paid > 0) {
            amount = stripeInvoice.amount_paid / 100; // Convertir de centavos a dólares
        } else if (stripeInvoice.amount_due) {
            amount = stripeInvoice.amount_due / 100; // Convertir de centavos a dólares
        } else if (stripeInvoice.total) {
            amount = stripeInvoice.total / 100; // Convertir de centavos a dólares
        }
        
        // Manejar subscription: buscar en múltiples ubicaciones
        let subscriptionId = null;
        
        // 1. Buscar directamente en el invoice (si existe)
        if (stripeInvoice.subscription) {
            subscriptionId = typeof stripeInvoice.subscription === 'string' 
                ? stripeInvoice.subscription 
                : stripeInvoice.subscription.id || null;
        }
        
        // 2. Buscar en parent.subscription_details.subscription
        if (!subscriptionId && stripeInvoice.parent?.subscription_details?.subscription) {
            subscriptionId = typeof stripeInvoice.parent.subscription_details.subscription === 'string'
                ? stripeInvoice.parent.subscription_details.subscription
                : stripeInvoice.parent.subscription_details.subscription.id || null;
        }
        
        // 3. Buscar en lines.data[0].parent.subscription_item_details.subscription
        if (!subscriptionId && stripeInvoice.lines?.data && stripeInvoice.lines.data.length > 0) {
            const firstLine = stripeInvoice.lines.data[0];
            if (firstLine.parent?.subscription_item_details?.subscription) {
                subscriptionId = typeof firstLine.parent.subscription_item_details.subscription === 'string'
                    ? firstLine.parent.subscription_item_details.subscription
                    : firstLine.parent.subscription_item_details.subscription.id || null;
            }
        }
        
        // Stripe llama invoice_pdf al PDF del cobro; en DB es ticket_pdf.
        const ticketPdf = stripeInvoice.invoice_pdf || null;
        const stripeInvoiceUrl = stripeInvoice.hosted_invoice_url || null;
        const customerId =
            typeof stripeInvoice.customer === 'string'
                ? stripeInvoice.customer
                : stripeInvoice.customer?.id || null;
        
        return new PaymentHistory(
            uuid.v4(),
            subscriptionId,
            stripeInvoice.id,
            stripeInvoice.status,
            amount,
            ticketPdf,
            new Date(stripeInvoice.created * 1000),
            stripeInvoiceUrl,
            customerId,
            null
        );
    }

    /**
     * Anticipo / setup (Checkout mode=payment). Sin suscripción.
     * stripe_invoice_id: invoice de Stripe si existe; si no, id estable de la session.
     */
    static fromStripeCheckoutSession(session, invoiceExtras = {}) {
        const amount =
            session.amount_total != null ? Number(session.amount_total) / 100 : 0;
        const customerId =
            typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id || null;
        const invoiceId =
            typeof session.invoice === 'string'
                ? session.invoice
                : session.invoice?.id || null;
        const stripeInvoiceId = invoiceId || `checkout:${session.id}`;
        const ticketPdf =
            invoiceExtras.invoice_pdf ||
            session.invoice_pdf ||
            null;
        const hostedUrl =
            invoiceExtras.hosted_invoice_url ||
            session.hosted_invoice_url ||
            null;
        const created =
            session.created != null
                ? new Date(session.created * 1000)
                : new Date();

        return new PaymentHistory(
            uuid.v4(),
            null,
            stripeInvoiceId,
            session.payment_status || 'paid',
            amount,
            ticketPdf,
            created,
            hostedUrl,
            customerId,
            session.id
        );
    }
}

module.exports = PaymentHistory;
