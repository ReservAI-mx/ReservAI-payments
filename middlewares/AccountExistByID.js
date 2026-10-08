const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');
const AccountManager = require('../utils/AccountManager');
const { connectDB } = require('../data/connectDB');
const Account = require('../models/account');
const AccountExistByID = async (req, res, next) => {
    const id = req.token_id;
    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'AccountExistByID', `db id=${id}`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }
    
    const result = await AccountManager.accountExistsByID(id, db);
    if (result.error) {
        logAction(req, 'error', 'AccountExistByID', `lookup id=${id}`);
        return res.status(500).json({ error: result.error });
    }
    if (!result.exists) {
        logAction(req, 'warning', 'AccountExistByID', `missing id=${id}`);
        return res.status(400).json({ error: 'Account does not exist' });
    }
    result.account = new Account(result.account.id, result.account.name, result.account.email, result.account.password, result.account.createdAt, result.account.started, result.account.verified, result.account.type, result.account.twofaenabled, result.account.salt);
    req.account = result.account;
    addRequestTraceStep(req, 'AccountExistByID', {
        account_id: String(result.account.id),
        account_type: result.account.type,
        verified: result.account.verified,
    });
    next();
}

module.exports = AccountExistByID;