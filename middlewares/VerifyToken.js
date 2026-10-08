const TokenClass = require('../utils/TokenClass');
const TokenManager = require('../utils/TokenManager');
const ApiKeyManager = require('../utils/ApiKeyManager');
const CookieAuth = require('../utils/CookieAuth');
const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');

/** Billing solo necesita sesión access; priorizar esa cookie si coexisten otras. */
const DEFAULT_PRIORITY = [
    'access',
    'two_factor_authentication',
    'totp_recovery',
    'reset_password',
    'confirm_invitation',
    'email_sender',
];

function applyDecoded(req, token_) {
    req.token_id = token_.id;
    req.token_type = token_.token_type;
    req.session_version =
        typeof token_.session_version === 'number' ? token_.session_version : 0;
    req.token_extra = token_.extra || {};
}

function pickBestValidCookie(req) {
    const candidates = [];
    for (const cookie of CookieAuth.listAuthCookies(req)) {
        const result = TokenManager.VerifyToken(cookie.value);
        if (result.error) continue;
        const token_ = TokenClass.FromDecodedInfo(result.decoded);
        if (!token_) continue;
        candidates.push({ cookie, token_ });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        const pa = DEFAULT_PRIORITY.indexOf(a.token_.token_type);
        const pb = DEFAULT_PRIORITY.indexOf(b.token_.token_type);
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    });
    return candidates[0];
}

const VerifyToken = async (req, res, next) => {
    const headerToken = req.headers['authorization'];
    const isProduction =
        process.env.NODE_ENV === 'production' ||
        process.env.IS_PRODUCTION === 'true' ||
        global.IS_PRODUCTION === true;

    if (headerToken && typeof headerToken === 'string') {
        const apiKeyId = ApiKeyManager.VerifyApiKey(headerToken);
        if (apiKeyId) {
            if (isProduction) {
                logAction(req, 'warning', 'VerifyToken', 'api key disabled');
                return res.status(403).json({
                    error: 'API Keys are disabled in production',
                    message: 'Please use JWT cookies for authentication',
                    code: 'API_KEY_DISABLED',
                });
            }
            req.token_id = apiKeyId;
            req.token_type = 'access';
            req.session_version = 0;
            req.token_extra = {};
            addRequestTraceStep(req, 'VerifyToken', {
                auth: 'api_key',
                token_type: 'access',
            });
            return next();
        }
    }

    const best = pickBestValidCookie(req);
    if (!best) {
        logAction(req, 'warning', 'VerifyToken', 'token required');
        return res.status(418).json({ error: 'Token is required' });
    }

    applyDecoded(req, best.token_);
    addRequestTraceStep(req, 'VerifyToken', {
        auth: 'jwt_cookie',
        token_type: req.token_type,
        cookie: best.cookie.name,
    });
    next();
};

module.exports = VerifyToken;
