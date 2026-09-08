const SubscriptionManager = require('../utils/SubscriptionManager');
const CustomersManager = require('../utils/CustomersManager');
const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { connectDB } = require('../data/connectDB');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ActivateSubscription = async (req, res) => {
    const { customer, account } = req;
    const technical_info_id = req.body && req.body.technical_info_id;
    if (!UUID_RE.test(String(technical_info_id || ''))) {
        return res.status(400).json({ error: 'Falta technical_info_id o no es uuid' });
    }

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }

    const lookup = await TechnicalInfoManager.getSetupForActivate(
        technical_info_id,
        account.id,
        db
    );
    if (lookup.error) {
        return res.status(500).json({ error: lookup.error });
    }
    if (!lookup.setup) {
        return res.status(404).json({ error: 'technical_info no existe o no es de esta cuenta' });
    }
    if (lookup.setup.status !== 'ready_for_subscription' || lookup.setup.stripe_subscription_id) {
        return res.status(409).json({ error: 'SETUP_NOT_READY' });
    }

    let stripe = null;
    try {
        stripe = await getStripeInstance();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }

    const portalResult = await CustomersManager.createPortalSession(
        customer.stripe_customer_id,
        stripe
    );
    const portalUrl = portalResult.success ? portalResult.session.url : null;

    const result = await SubscriptionManager.createActivateCheckout(
        customer.stripe_customer_id,
        account.id,
        technical_info_id,
        lookup.setup.planned_plan,
        portalUrl,
        portalUrl,
        stripe
    );
    if (!result.success) {
        return res.status(500).json({ error: result.error || 'Error creating checkout session' });
    }

    return res.status(200).json({
        url: result.url,
        session_id: result.session_id,
        plan: result.plan,
        technical_info_id,
    });
};

module.exports = ActivateSubscription;
