class Subscription {
    constructor(
        stripe_customer_id,
        stripe_subscription_id,
        stripe_product_id = null,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end = false,
        plan_name = null,
        amount,
        created_at = new Date(),
        technical_info_id = null
    ) {
        this.stripe_customer_id = stripe_customer_id;
        this.stripe_subscription_id = stripe_subscription_id;
        this.stripe_product_id = stripe_product_id;
        this.status = status;
        this.current_period_start = current_period_start;
        this.current_period_end = current_period_end;
        this.cancel_at_period_end = cancel_at_period_end;
        this.plan_name = plan_name;
        this.amount = amount;
        this.created_at = created_at;
        this.technical_info_id = technical_info_id || null;
    }

    toJSON() {
        return {
            stripe_customer_id: this.stripe_customer_id,
            stripe_subscription_id: this.stripe_subscription_id,
            stripe_product_id: this.stripe_product_id,
            status: this.status,
            current_period_start: this.current_period_start,
            current_period_end: this.current_period_end,
            cancel_at_period_end: this.cancel_at_period_end,
            plan_name: this.plan_name,
            amount: this.amount,
            created_at: this.created_at,
            technical_info_id: this.technical_info_id
        }
    }

    // Método estático para crear desde objeto de Stripe
    static fromStripeObject(stripeSubscription) {
        const items = stripeSubscription.items?.data || [];
        const firstItem = items[0];
        const price = firstItem?.price;
        
        // Manejar product que puede ser un objeto expandido o un ID
        let productId = null;
        if (price?.product) {
            productId = typeof price.product === 'string' 
                ? price.product 
                : price.product.id || null;
        }
        
        // Obtener plan_name: primero de metadata del price, luego metadata de subscription, luego nickname del price, luego nombre del product
        let planName = null;
        if (price?.metadata?.plan) {
            planName = price.metadata.plan;
        } else if (stripeSubscription.metadata?.plan) {
            planName = stripeSubscription.metadata.plan;
        } else if (price?.nickname) {
            planName = price.nickname;
        } else if (price?.product && typeof price.product === 'object') {
            planName = price.product.name || null;
        }
        
        // Obtener períodos: primero de items.data[0], luego del objeto principal
        const periodStart = firstItem?.current_period_start || stripeSubscription.current_period_start;
        const periodEnd = firstItem?.current_period_end || stripeSubscription.current_period_end;
        
        return new Subscription(
            stripeSubscription.customer,
            stripeSubscription.id,
            productId,
            stripeSubscription.status,
            periodStart ? new Date(periodStart * 1000) : new Date(),
            periodEnd ? new Date(periodEnd * 1000) : new Date(),
            stripeSubscription.cancel_at_period_end || false,
            planName,
            price?.unit_amount ? price.unit_amount / 100 : 0, // Convertir de centavos a dólares
            new Date(stripeSubscription.created * 1000),
            stripeSubscription.metadata?.technical_info_id || null
        );
    }
}

module.exports = Subscription;
