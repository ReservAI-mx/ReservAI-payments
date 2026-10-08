const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');

const AccountIsAdmin = async (req, res, next) => {
    const account = req.account;
    if (account.type !== 'admin') {
        logAction(req, 'warning', 'AccountIsAdmin', `not admin id=${account.id}`);
        return res.status(403).json({ error: 'Account is not an admin' });
    }
    addRequestTraceStep(req, 'AccountIsAdmin', { account_type: account.type });
    next();
};

module.exports = AccountIsAdmin;
