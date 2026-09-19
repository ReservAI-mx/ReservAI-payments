const Sentry = require('../instrument-sentry');
const { buildSentryFlowContext } = require('../utils/RequestTrace');

function sentryDsnConfigured() {
  const dsn = process.env.SENTRY_DSN;
  return typeof dsn === 'string' && dsn.trim().length > 0;
}

/**
 * Loggea respuestas HTTP >= 500 y las manda a Sentry (si hay DSN).
 * Parche por petición sobre res.send (res.json en Express hace stringify + send).
 * Evita duplicar con el error handler del SDK vía res.sentry y _sentry5xxReported.
 */
function sentryHttp5xxCapture(req, res, next) {
  const origSend = res.send.bind(res);
  res.send = function sentrySendWrapper(body) {
    if (!res._sentry5xxReported && res.statusCode >= 500 && !res.sentry) {
      res._sentry5xxReported = true;
      try {
        let detail = '';
        if (body != null) {
          if (typeof body === 'string') {
            try {
              const parsed = JSON.parse(body);
              if (parsed && typeof parsed.error === 'string') {
                detail = parsed.error.slice(0, 500);
              }
            } catch {
              detail = body.slice(0, 500);
            }
          } else if (typeof body === 'object' && typeof body.error === 'string') {
            detail = body.error.slice(0, 500);
          }
        }
        const path = typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : req.path || '';
        const msg = detail ? `HTTP ${res.statusCode}: ${detail}` : `HTTP ${res.statusCode}`;
        console.error(`[stripe][http] ${req.method} ${path} → ${msg}`);

        if (sentryDsnConfigured()) {
          Sentry.withScope((scope) => {
            scope.setTag('error_source', 'http_response');
            scope.setTag('http_status', String(res.statusCode));
            const flowCtx = buildSentryFlowContext(req);
            scope.setContext('request_flow', flowCtx);
            const actorId = flowCtx.actor?.account_id;
            if (actorId) scope.setUser({ id: actorId });
            else if (req.account?.id) scope.setUser({ id: String(req.account.id) });
            Sentry.captureMessage(msg, 'error');
          });
        }
      } catch {
        /* no bloquear la respuesta */
      }
    }
    return origSend(body);
  };

  next();
}

module.exports = { sentryHttp5xxCapture };
