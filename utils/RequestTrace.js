/**
 * Acumula en req el flujo de middlewares ejecutados (orden, tiempos, datos no sensibles)
 * para enriquecer Sentry sin persistir secretos ni tokens en claro.
 */

const { getClientIp } = require('./ClientIp');

function ensureTrace(req) {
    if (!req.passRequestTrace) {
        req.passRequestTrace = {
            startedAt: Date.now(),
            steps: [],
            clientIp: getClientIp(req),
            userAgent: req.get('User-Agent') ? String(req.get('User-Agent')).slice(0, 256) : null,
        };
    }
}

function requestTraceMiddleware(req, res, next) {
    req.passRequestTrace = {
        startedAt: Date.now(),
        steps: [],
        clientIp: getClientIp(req),
        userAgent: req.get('User-Agent') ? String(req.get('User-Agent')).slice(0, 256) : null,
    };
    const path = typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : req.path || '';
    console.log(`[stripe][http] → ${req.method} ${path}`);
    res.on('finish', () => {
        const ms = Date.now() - req.passRequestTrace.startedAt;
        const line = `[stripe][http] ← ${req.method} ${path} ${res.statusCode} ${ms}ms`;
        if (res.statusCode >= 500) {
            console.error(line);
        } else if (res.statusCode >= 400) {
            console.warn(line);
        } else {
            console.log(line);
        }
    });
    next();
}

function sanitizeDetailKey(key) {
    if (key === 'token_type') return false;
    return /password|secret|authorization|cookie|^token$/i.test(key);
}

function addRequestTraceStep(req, stepName, details = {}) {
    ensureTrace(req);
    const ms = Date.now() - req.passRequestTrace.startedAt;
    const safe = {};
    if (details && typeof details === 'object') {
        for (const [k, v] of Object.entries(details)) {
            if (sanitizeDetailKey(k)) continue;
            if (v == null) continue;
            if (typeof v === 'string' && v.length > 128) safe[k] = `${v.slice(0, 128)}…`;
            else safe[k] = v;
        }
    }
    req.passRequestTrace.steps.push({
        ms,
        step: stepName,
        ...safe,
    });
}

function safeParams(params) {
    if (!params || typeof params !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(params)) {
        if (/token/i.test(k)) out[k] = '[redacted]';
        else out[k] = typeof v === 'string' ? v.slice(0, 64) : v;
    }
    return out;
}

/**
 * Contexto listo para scope.setContext('request_flow', …) en Sentry.
 */
function buildSentryFlowContext(req) {
    ensureTrace(req);
    const trace = req.passRequestTrace;

    const actor = {};
    if (req.account?.id) {
        actor.account_id = String(req.account.id);
        actor.account_type = req.account.type;
        actor.verified = req.account.verified;
    }
    if (req.token_id && !actor.account_id) {
        actor.jwt_subject_id = String(req.token_id);
    }

    const target = {};
    if (req.account_id_url?.id) target.target_account_id = String(req.account_id_url.id);
    if (req.account_type_url?.type) target.target_account_type = req.account_type_url.type;

    const route = {
        method: req.method,
        path: typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : '',
    };
    if (req.baseUrl) route.baseUrl = req.baseUrl;
    if (req.route?.path) route.pattern = `${req.baseUrl || ''}${req.route.path}`;
    if (req.params && Object.keys(req.params).length) route.params = safeParams(req.params);

    return {
        elapsed_ms: Date.now() - trace.startedAt,
        client_ip: trace.clientIp || req.ip,
        user_agent: trace.userAgent,
        middleware_flow: trace.steps,
        actor,
        target,
        jwt_token_type: req.token_type || null,
        route,
    };
}

module.exports = {
    requestTraceMiddleware,
    addRequestTraceStep,
    buildSentryFlowContext,
};
