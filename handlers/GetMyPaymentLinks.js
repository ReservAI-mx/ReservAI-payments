const SubscriptionManager = require('../utils/SubscriptionManager');
const CustomersManager = require('../utils/CustomersManager');
const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { connectDB } = require('../data/connectDB');
const { validateSubdomain } = require('../utils/SubdomainValidator');

const GetMyPaymentLinks = async (req, res) => {
    const { customer } = req;
    const { account } = req;
    const parsed = validateSubdomain(req.query.subdomain);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }

    const taken = await TechnicalInfoManager.subdomainTaken(parsed.subdomain, db);
    if (taken.error) {
        return res.status(500).json({ error: taken.error });
    }
    if (taken.taken) {
        return res.status(409).json({ error: 'SUBDOMAIN_TAKEN' });
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

    let portalUrl = null;
    if (portalResult.success) {
        portalUrl = portalResult.session.url;
    }

    const result = await SubscriptionManager.createSetupPaymentLinks(
        customer.stripe_customer_id,
        account.id,
        parsed.subdomain,
        portalUrl,
        portalUrl,
        stripe
    );

    if (!result.success) {
        return res.status(500).json({
            error: result.error || 'Error creating payment links',
            errors: result.errors
        });
    }

    return res.status(200).json({
        message: result.message,
        paymentLinks: result.paymentLinks
    });
}

module.exports = GetMyPaymentLinks;
