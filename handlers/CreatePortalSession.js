const CustomersManager = require('../utils/CustomersManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { captureStripeFailure } = require('../utils/captureOpsError');

const CreatePortalSession = async (req, res) => {
    const {customer} = req;
    let stripe = null;
    try {
        stripe = await getStripeInstance();
    } catch (error) {
        captureStripeFailure(error, { phase: 'billing.portal.getStripe' });
        return res.status(500).json({ error: 'Internal server error' });
    }
    const result = await CustomersManager.createPortalSession(customer.stripe_customer_id, stripe);
    if (result.error) {
        captureStripeFailure(result.error, { phase: 'billing.portal.create' });
        return res.status(500).json({ error: result.error });
    }
    return res.status(200).json({ session: result.session });

}

module.exports = CreatePortalSession;
