const getStripeInstance = require('../data/StripeInstanceGetter');
const CustomersManager = require('../utils/CustomersManager');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const CreateStripeCustomer = async (req, res) => {
    const {email, name, id} = req.account;
    let stripe = null;
    try {
        stripe = await getStripeInstance();
    } catch (error) {
        logAction(req, 'error', 'CreateStripeCustomer', `stripe id=${id}`, error);
        captureStripeFailure(error, { phase: 'billing.customer.getStripe' });
        return res.status(500).json({ error: 'Internal server error' });
    }

    const result = await CustomersManager.createCustomerInStripe(id, email, name, stripe);
    if (result.error) {
        logAction(req, 'error', 'CreateStripeCustomer', `create id=${id}`);
        captureStripeFailure(result.error, { phase: 'billing.customer.create' });
        return res.status(500).json({ error: result.error });
    }

    logAction(req, 'info', 'CreateStripeCustomer', `ok id=${id}`);
    return res.status(200).json({ message: result.message, customer: result.customer });

}

module.exports = CreateStripeCustomer;
