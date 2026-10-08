const SubscriptionManager = require('../utils/SubscriptionManager');
const CustomersManager = require('../utils/CustomersManager');
const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const ProductsManager = require('../utils/ProductsManager');
const FiscalInfoManager = require('../utils/FiscalInfoManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { connectDB } = require('../data/connectDB');
const { validateSubdomain } = require('../utils/SubdomainValidator');
const { normalizePipelineTestPhone } = require('../utils/PhoneValidator');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const GetMyPaymentLinks = async (req, res) => {
    const { customer } = req;
    const { account } = req;
    const parsed = validateSubdomain(req.query.subdomain);
    if (parsed.error) {
        logAction(req, 'warning', 'GetMyPaymentLinks', `invalid subdomain account=${account.id}`);
        return res.status(400).json({ error: parsed.error });
    }
    const phone = normalizePipelineTestPhone(req.query.pipeline_test_phone);
    if (!phone.ok) {
        logAction(req, 'warning', 'GetMyPaymentLinks', `invalid phone account=${account.id}`);
        return res.status(400).json({ error: 'PIPELINE_TEST_PHONE_INVALID' });
    }

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'GetMyPaymentLinks', `db account=${account.id}`, error);
        captureStripeFailure(error, { phase: 'billing.links.connectDB' });
        return res.status(500).json({ error: 'Internal server error' });
    }

    const taken = await TechnicalInfoManager.subdomainTaken(parsed.subdomain, db);
    if (taken.error) {
        logAction(req, 'error', 'GetMyPaymentLinks', `subdomain account=${account.id}`);
        captureStripeFailure(taken.error, {
            phase: 'billing.links.subdomainTaken',
            subdomain: parsed.subdomain,
        });
        return res.status(500).json({ error: taken.error });
    }
    if (taken.taken) {
        logAction(req, 'warning', 'GetMyPaymentLinks', `subdomain taken account=${account.id}`);
        return res.status(409).json({ error: 'SUBDOMAIN_TAKEN' });
    }

    const listed = await ProductsManager.list(db, true);
    if (!listed.success) {
        logAction(req, 'error', 'GetMyPaymentLinks', `products account=${account.id}`);
        captureStripeFailure(listed.error || 'list products failed', {
            phase: 'billing.links.listProducts',
        });
        return res.status(500).json({ error: listed.error || 'Error listando productos' });
    }
    if (!listed.products.length) {
        logAction(req, 'error', 'GetMyPaymentLinks', `no products account=${account.id}`);
        return res.status(503).json({ error: 'NO_ACTIVE_PRODUCTS' });
    }

    listed.products = await ProductsManager.ensureFacturamaProducts(listed.products, db);

    const priceCtx = await FiscalInfoManager.resolvePriceVariant(account.id, db);
    if (!priceCtx.success) {
        logAction(req, 'error', 'GetMyPaymentLinks', `price account=${account.id}`);
        captureStripeFailure(priceCtx.error || 'resolvePriceVariant failed', {
            phase: 'billing.links.resolvePriceVariant',
        });
        return res.status(500).json({ error: priceCtx.error || 'Error resolviendo precio fiscal' });
    }

    let stripe = null;
    try {
        stripe = await getStripeInstance();
    } catch (error) {
        logAction(req, 'error', 'GetMyPaymentLinks', `stripe account=${account.id}`, error);
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
        phone.canonical,
        portalUrl,
        portalUrl,
        stripe,
        listed.products,
        priceCtx
    );

    if (!result.success) {
        logAction(req, 'error', 'GetMyPaymentLinks', `links account=${account.id}`);
        captureStripeFailure(result.error || 'Error creating payment links', {
            phase: 'billing.links.createSetup',
            subdomain: parsed.subdomain,
        });
        return res.status(500).json({
            error: result.error || 'Error creating payment links',
            errors: result.errors
        });
    }

    logAction(req, 'info', 'GetMyPaymentLinks', `ok account=${account.id} links=${result.paymentLinks?.length || 0}`);
    return res.status(200).json({
        message: result.message,
        paymentLinks: result.paymentLinks,
        price_variant: result.price_variant,
        fiscal: result.fiscal,
    });
}

module.exports = GetMyPaymentLinks;
