const CustomersManager = require('../utils/CustomersManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const CreatePortalSession = async (req, res) => {
    const {customer} = req;
    let stripe = null;
    try {
        stripe = await getStripeInstance();
    } catch (error) {
        logAction(req, 'error', 'CreatePortalSession', `stripe customer=${customer.stripe_customer_id}`, error);
        captureStripeFailure(error, { phase: 'billing.portal.getStripe' });
        return res.status(500).json({ error: 'Internal server error' });
    }
    const result = await CustomersManager.createPortalSession(customer.stripe_customer_id, stripe);
    if (result.error) {
        logAction(req, 'error', 'CreatePortalSession', `create customer=${customer.stripe_customer_id}`);
        captureStripeFailure(result.error, { phase: 'billing.portal.create' });
        return res.status(500).json({ error: result.error });
    }
    logAction(req, 'info', 'CreatePortalSession', `ok customer=${customer.stripe_customer_id}`);
    return res.status(200).json({ session: result.session });

}

module.exports = CreatePortalSession;
