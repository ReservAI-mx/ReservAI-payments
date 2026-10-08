/**
 * Acumula en req el flujo de middlewares ejecutados (orden, tiempos, datos no sensibles).
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

function redact(text) {
    return String(text == null ? '' : text)
        .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
        .replace(/(password|token|secret|authorization|cookie)=\S+/gi, '$1=[REDACTED]');
}

function logAction(req, level, event, message, err) {
    const errText = err == null
        ? ''
        : (typeof err === 'object' && err.message ? err.message : String(err));
    const text = redact(errText ? `${message}: ${errText}` : message);
    const traceId = req && req.trace && req.trace.trace_id ? req.trace.trace_id : '-';
    const line = `${new Date().toISOString()} [${level}] trace=${traceId} ${event} ${text}`;
    if (level === 'error') console.error(line);
    else if (level === 'warning') console.warn(line);
    else console.log(line);

    const tracer = req && req.trace;
    if (!tracer || typeof tracer[level] !== 'function') return;
    if (level === 'error') tracer.error(text, err && typeof err === 'object' ? err : undefined, event);
    else tracer[level](text, event);
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
    const fields = Object.entries(safe).map(([k, v]) => `${k}=${v}`).join(' ');
    const level = details && details.ok === false ? 'warning' : 'info';
    logAction(req, level, stepName, fields || stepName);
}

module.exports = {
    requestTraceMiddleware,
    addRequestTraceStep,
    logAction,
};
