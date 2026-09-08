const CreateSubscriptionInDB = require('../queries/CreateSubscriptionInDB');
const UpdateSubscriptionInDB = require('../queries/UpdateSubscriptionInDB');
const UpdateSubscriptionOnPaymentSuccess = require('../queries/UpdateSubscriptionOnPaymentSuccess');
const UpdateSubscriptionOnPaymentFailed = require('../queries/UpdateSubscriptionOnPaymentFailed');
const UpdateSubscriptionOnCancellation = require('../queries/UpdateSubscriptionOnCancellation');
const Subscription = require('../models/subscription');
const GetSubscriptionsSummaries = require('../queries/GetSubscriptionsSummaries');

class SubscriptionManager {

    static async getSubscriptionsSummaries(stripe_customer_id, account_id, db, offset = 0, limit = 1000) {
        try {
            const result = await db.query(GetSubscriptionsSummaries, [
                stripe_customer_id,
                account_id,
                limit,
                offset
            ]);
            return {
                success: true,
                message: 'Subscriptions summaries retrieved successfully',
                subscriptions: result.rows
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error retrieving subscriptions summaries',
                error: error.message
            }
        }
    }
    static async createSubscriptionInDB(subscription, db) {
        try {
            const subscriptionData = subscription.toJSON();
            const result = await db.query(CreateSubscriptionInDB, [
                subscriptionData.stripe_customer_id,
                subscriptionData.stripe_subscription_id,
                subscriptionData.stripe_product_id,
                subscriptionData.status,
                subscriptionData.current_period_start,
                subscriptionData.current_period_end,
                subscriptionData.cancel_at_period_end,
                subscriptionData.plan_name,
                subscriptionData.amount,
                subscriptionData.created_at,
                subscriptionData.technical_info_id || null
            ]);
            return {
                success: true,
                message: 'Subscription created successfully',
                subscription: result.rows[0]
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error creating subscription',
                error: error.message
            }
        }
    }

    static async updateSubscriptionInDB(subscription, db) {
        try {
            const subscriptionData = subscription.toJSON();
            const result = await db.query(UpdateSubscriptionInDB, [
                subscriptionData.stripe_customer_id,
                subscriptionData.stripe_subscription_id,
                subscriptionData.stripe_product_id,
                subscriptionData.status,
                subscriptionData.current_period_start,
                subscriptionData.current_period_end,
                subscriptionData.cancel_at_period_end,
                subscriptionData.plan_name,
                subscriptionData.amount
            ]);
            return {
                success: true,
                message: 'Subscription updated successfully',
                subscription: result.rows[0]
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error updating subscription',
                error: error.message
            }
        }
    }

    static async updateSubscriptionOnPaymentSuccess(stripe_customer_id, stripe_subscription_id, period_start, period_end, db) {
        try {
            const result = await db.query(UpdateSubscriptionOnPaymentSuccess, [
                stripe_customer_id,
                stripe_subscription_id,
                period_start,
                period_end
            ]);
            return {
                success: true,
                message: 'Subscription updated on payment success',
                subscription: result.rows[0]
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error updating subscription on payment success',
                error: error.message
            }
        }
    }

    static async updateSubscriptionOnPaymentFailed(stripe_customer_id, stripe_subscription_id, status = 'unpaid', db) {
        try {
            const result = await db.query(UpdateSubscriptionOnPaymentFailed, [
                stripe_customer_id,
                stripe_subscription_id,
                status
            ]);
            return {
                success: true,
                message: 'Subscription updated on payment failed',
                subscription: result.rows[0]
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error updating subscription on payment failed',
                error: error.message
            }
        }
    }

    static async updateSubscriptionOnCancellation(stripe_customer_id, stripe_subscription_id, db) {
        try {
            const result = await db.query(UpdateSubscriptionOnCancellation, [
                stripe_customer_id,
                stripe_subscription_id
            ]);
            return {
                success: true,
                message: 'Subscription updated on cancellation',
                subscription: result.rows[0]
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error updating subscription on cancellation',
                error: error.message
            }
        }
    }


    static async createSubscriptionPaymentLinks(stripe_customer_id, account_id = null, customer_email = null, success_url = null, cancel_url = null, stripe) {
        try {
            if (!stripe_customer_id) {
                return {
                    success: false,
                    message: 'Error creating checkout sessions',
                    error: 'stripe_customer_id is required'
                }
            }

            // Obtener los price IDs de las variables de entorno
            const priceIdBasico = process.env.STRIPE_PRICE_ID_BASICO;
            const priceIdPremium = process.env.STRIPE_PRICE_ID_PREMIUM;

            if (!priceIdBasico || !priceIdPremium) {
                return {
                    success: false,
                    message: 'Error creating checkout sessions',
                    error: 'Price IDs not configured. Set STRIPE_PRICE_ID_BASICO and STRIPE_PRICE_ID_PREMIUM in environment variables.'
                }
            }

            // Preparar metadata base
            const baseMetadata = {
                customer_id: stripe_customer_id
            };
            if (account_id) {
                baseMetadata.account_id = account_id;
            }

            // URLs de redirección (requeridas por Stripe)
            // Si no se proporcionan, usar valores por defecto
            const successUrl = success_url || process.env.PAYMENT_SUCCESS_URL || 'https://stripe.com';
            const cancelUrl = cancel_url || process.env.PAYMENT_CANCEL_URL || 'https://stripe.com';

            // Crear ambas sesiones de Checkout en paralelo (asociadas al customer existente)
            const [basicoSession, premiumSession] = await Promise.all([
                stripe.checkout.sessions.create({
                    customer: stripe_customer_id, // Asociar al customer existente
                    payment_method_types: ['card'],
                    mode: 'subscription',
                    line_items: [
                        {
                            price: priceIdBasico,
                            quantity: 1
                        }
                    ],
                    metadata: {
                        ...baseMetadata,
                        Plan: 'Plan basico'
                    },
                    success_url: successUrl,
                    cancel_url: cancelUrl,
                    client_reference_id: account_id || undefined
                }),
                stripe.checkout.sessions.create({
                    customer: stripe_customer_id, // Asociar al customer existente
                    payment_method_types: ['card'],
                    mode: 'subscription',
                    line_items: [
                        {
                            price: priceIdPremium,
                            quantity: 1
                        }
                    ],
                    metadata: {
                        ...baseMetadata,
                        Plan: 'Plan premium'
                    },
                    success_url: successUrl,
                    cancel_url: cancelUrl,
                    client_reference_id: account_id || undefined
                })
            ]);

            return {
                success: true,
                message: 'Checkout sessions created successfully',
                paymentLinks: {
                    basico: {
                        url: basicoSession.url,
                        plan: 'Plan basico',
                        session_id: basicoSession.id
                    },
                    premium: {
                        url: premiumSession.url,
                        plan: 'Plan premium',
                        session_id: premiumSession.id
                    }
                }
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error creating checkout sessions',
                error: error.message
            }
        }
    }

    static async createSetupPaymentLinks(stripe_customer_id, account_id, subdomain, success_url = null, cancel_url = null, stripe) {
        try {
            if (!stripe_customer_id) {
                return {
                    success: false,
                    message: 'Error creating checkout sessions',
                    error: 'stripe_customer_id is required'
                }
            }

            const priceIdSetup = process.env.STRIPE_PRICE_ID_SETUP;
            if (!priceIdSetup) {
                return {
                    success: false,
                    message: 'Error creating checkout sessions',
                    error: 'Price IDs not configured. Set STRIPE_PRICE_ID_SETUP in environment variables.'
                }
            }

            const baseMetadata = {
                kind: 'setup',
                customer_id: stripe_customer_id,
                subdomain
            };
            if (account_id) {
                baseMetadata.account_id = account_id;
            }

            const successUrl = success_url || process.env.PAYMENT_SUCCESS_URL || 'https://stripe.com';
            const cancelUrl = cancel_url || process.env.PAYMENT_CANCEL_URL || 'https://stripe.com';

            const [basicoSession, premiumSession] = await Promise.all([
                stripe.checkout.sessions.create({
                    customer: stripe_customer_id,
                    payment_method_types: ['card'],
                    mode: 'payment',
                    line_items: [{ price: priceIdSetup, quantity: 1 }],
                    metadata: { ...baseMetadata, planned_plan: 'basico' },
                    success_url: successUrl,
                    cancel_url: cancelUrl,
                    client_reference_id: account_id || undefined
                }),
                stripe.checkout.sessions.create({
                    customer: stripe_customer_id,
                    payment_method_types: ['card'],
                    mode: 'payment',
                    line_items: [{ price: priceIdSetup, quantity: 1 }],
                    metadata: { ...baseMetadata, planned_plan: 'premium' },
                    success_url: successUrl,
                    cancel_url: cancelUrl,
                    client_reference_id: account_id || undefined
                })
            ]);

            return {
                success: true,
                message: 'Checkout sessions created successfully',
                paymentLinks: {
                    basico: {
                        url: basicoSession.url,
                        plan: 'Plan basico',
                        session_id: basicoSession.id
                    },
                    premium: {
                        url: premiumSession.url,
                        plan: 'Plan premium',
                        session_id: premiumSession.id
                    }
                }
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error creating checkout sessions',
                error: error.message
            }
        }
    }

    static async createActivateCheckout(stripe_customer_id, account_id, technical_info_id, planned_plan, success_url, cancel_url, stripe) {
        try {
            if (!stripe_customer_id || !technical_info_id) {
                return {
                    success: false,
                    message: 'Error creating checkout session',
                    error: 'stripe_customer_id and technical_info_id are required'
                }
            }

            const plan = String(planned_plan || '').toLowerCase().includes('premium')
                ? 'premium'
                : 'basico';
            const priceId = plan === 'premium'
                ? process.env.STRIPE_PRICE_ID_PREMIUM
                : process.env.STRIPE_PRICE_ID_BASICO;
            if (!priceId) {
                return {
                    success: false,
                    message: 'Error creating checkout session',
                    error: 'Price IDs not configured'
                }
            }

            const successUrl = success_url || process.env.PAYMENT_SUCCESS_URL || 'https://stripe.com';
            const cancelUrl = cancel_url || process.env.PAYMENT_CANCEL_URL || 'https://stripe.com';

            const session = await stripe.checkout.sessions.create({
                customer: stripe_customer_id,
                payment_method_types: ['card'],
                mode: 'subscription',
                line_items: [{ price: priceId, quantity: 1 }],
                metadata: {
                    kind: 'monthly',
                    account_id: account_id || '',
                    technical_info_id,
                    planned_plan: plan
                },
                subscription_data: {
                    metadata: {
                        kind: 'monthly',
                        account_id: account_id || '',
                        technical_info_id,
                        planned_plan: plan
                    }
                },
                success_url: successUrl,
                cancel_url: cancelUrl,
                client_reference_id: account_id || undefined
            });

            return {
                success: true,
                url: session.url,
                session_id: session.id,
                plan,
                technical_info_id
            }
        } catch (error) {
            return {
                success: false,
                message: 'Error creating checkout session',
                error: error.message
            }
        }
    }
}

module.exports = SubscriptionManager;

