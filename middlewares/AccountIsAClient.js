const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');

const AccountIsAClient = async (req, res, next) => {
    const account = req.account;
    if (account.type !== 'client') {
        logAction(req, 'warning', 'AccountIsAClient', `not client id=${account.id}`);
        return res.status(403).json({ error: 'Account is not a client' });
    }
    addRequestTraceStep(req, 'AccountIsAClient', { account_type: account.type });
    next();
}

module.exports = AccountIsAClient;