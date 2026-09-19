const Sentry = require('../instrument-sentry');
const { buildSentryFlowContext } = require('../utils/RequestTrace');

function sentryDsnConfigured() {
  const dsn = process.env.SENTRY_DSN;
  return typeof dsn === 'string' && dsn.trim().length > 0;
}

function extractErrorBody(body) {
  if (body == null) return { detail: '', raw: '' };
  let parsed = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return { detail: body.slice(0, 500), raw: body.slice(0, 800) };
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { detail: String(body).slice(0, 500), raw: String(body).slice(0, 800) };
  }
  const detail =
    (typeof parsed.error === 'string' && parsed.error) ||
    (typeof parsed.message === 'string' && parsed.message) ||
    '';
  let raw = '';
  try {
    raw = JSON.stringify(parsed).slice(0, 800);
  } catch {
    raw = detail;
  }
  return { detail: String(detail).slice(0, 500), raw };
}

/**
 * Loggea respuestas HTTP de error (API y webhooks) y manda >=500 a Sentry si hay DSN.
 * Cubre handlers que no llaman captureStripeFailure.
 */
function sentryHttp5xxCapture(req, res, next) {
  const origSend = res.send.bind(res);
  res.send = function sentrySendWrapper(body) {
    if (!res._sentry5xxReported && res.statusCode >= 400 && !res.sentry) {
      res._sentry5xxReported = true;
      try {
        const { detail, raw } = extractErrorBody(body);
        const path =
          typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : req.path || '';
        const msg = detail
          ? `HTTP ${res.statusCode}: ${detail}`
          : `HTTP ${res.statusCode}`;
        const line = `[stripe][http] ${req.method} ${path} → ${msg}${raw && raw !== detail ? ` body=${raw}` : ''}`;
        if (res.statusCode >= 500) {
          console.error(line);
        } else {
          console.warn(line);
        }

        if (res.statusCode >= 500 && sentryDsnConfigured()) {
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
