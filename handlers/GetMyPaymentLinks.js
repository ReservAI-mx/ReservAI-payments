const SubscriptionManager = require('../utils/SubscriptionManager');
const CustomersManager = require('../utils/CustomersManager');
const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const ProductsManager = require('../utils/ProductsManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { connectDB } = require('../data/connectDB');
const { validateSubdomain } = require('../utils/SubdomainValidator');
const { captureStripeFailure } = require('../utils/captureOpsError');

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
        captureStripeFailure(error, { phase: 'billing.links.connectDB' });
        return res.status(500).json({ error: 'Internal server error' });
    }

    const taken = await TechnicalInfoManager.subdomainTaken(parsed.subdomain, db);
    if (taken.error) {
        captureStripeFailure(taken.error, {
            phase: 'billing.links.subdomainTaken',
            subdomain: parsed.subdomain,
        });
        return res.status(500).json({ error: taken.error });
    }
    if (taken.taken) {
        return res.status(409).json({ error: 'SUBDOMAIN_TAKEN' });
    }

    const listed = await ProductsManager.list(db, true);
    if (!listed.success) {
        captureStripeFailure(listed.error || 'list products failed', {
            phase: 'billing.links.listProducts',
        });
        return res.status(500).json({ error: listed.error || 'Error listando productos' });
    }
    if (!listed.products.length) {
        return res.status(503).json({ error: 'NO_ACTIVE_PRODUCTS' });
    }

    let stripe = null;
    try {
        stripe = await getStripeInstance();
    } catch (error) {
        captureStripeFailure(error, { phase: 'billing.links.getStripe' });
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
        stripe,
        listed.products
    );

    if (!result.success) {
        captureStripeFailure(result.error || 'Error creating payment links', {
            phase: 'billing.links.createSetup',
            subdomain: parsed.subdomain,
        });
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
