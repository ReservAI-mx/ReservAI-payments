const { addRequestTraceStep } = require('../utils/RequestTrace');

const AccountIsAdmin = async (req, res, next) => {
    console.log('AccountIsAdmin: starting...');
    const account = req.account;
    if (account.type !== 'admin') {
        console.log('AccountIsAdmin: account is not an admin');
        return res.status(403).json({ error: 'Account is not an admin' });
    }
    console.log('AccountIsAdmin: account is an admin');
    addRequestTraceStep(req, 'AccountIsAdmin', { account_type: account.type });
    next();
};

module.exports = AccountIsAdmin;
