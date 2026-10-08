const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');

const AccessTokenType = async (req, res, next) => {
    const token_type = req.token_type;
    if (token_type !== 'access') {
        logAction(req, 'warning', 'AccessTokenType', 'invalid token type');
        return res.status(401).json({ error: 'Invalid token type' });
    }
    addRequestTraceStep(req, 'AccessTokenType', { ok: true });
    next();
}

module.exports = AccessTokenType;