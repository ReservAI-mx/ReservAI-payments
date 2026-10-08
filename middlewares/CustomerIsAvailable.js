const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');
const CustomersManager = require('../utils/CustomersManager');
const { connectDB } = require('../data/connectDB');

const CustomerIsAvailable = async (req, res, next) => {
    const account_id = req.account.id;
    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'CustomerIsAvailable', `db id=${account_id}`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }
    const result = await CustomersManager.customerExistByID(account_id, db);
    if (result.error) {
        logAction(req, 'error', 'CustomerIsAvailable', `lookup id=${account_id}`);
        return res.status(500).json({ error: result.error });
    }
    if (result.exists) {
        logAction(req, 'warning', 'CustomerIsAvailable', `exists id=${account_id}`);
        return res.status(400).json({ error: 'Customer already exists' });
    }
    addRequestTraceStep(req, 'CustomerIsAvailable', { slot: 'new_customer_allowed' });
    next();
}

module.exports = CustomerIsAvailable;