const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');
const CustomersManager = require('../utils/CustomersManager');
const { connectDB } = require('../data/connectDB');

const CustomerExistByID = async (req, res, next) => {
    const account_id = req.account.id;
    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'CustomerExistByID', `db id=${account_id}`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }
    const result = await CustomersManager.customerExistByID(account_id, db);
    if (result.error) {
        logAction(req, 'error', 'CustomerExistByID', `lookup id=${account_id}`);
        return res.status(500).json({ error: result.error });
    }
    if (!result.exists) {
        logAction(req, 'warning', 'CustomerExistByID', `missing id=${account_id}`);
        return res.status(404).json({ error: 'Customer does not exist' });
    }
    req.customer = result.customer;
    addRequestTraceStep(req, 'CustomerExistByID', {
        stripe_customer_id: result.customer?.stripe_customer_id,
    });
    next();
}

module.exports = CustomerExistByID;