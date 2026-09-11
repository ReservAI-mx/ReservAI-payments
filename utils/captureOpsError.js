const Sentry = require('../instrument-sentry');

function captureOpsError(err, context = {}) {
  const error = err instanceof Error ? err : new Error(String(err));
  try {
    Sentry.withScope((scope) => {
      scope.setTag('area', String(context.area || 'ops'));
      if (context.phase) scope.setTag('phase', String(context.phase));
      if (context.event_type) {
        scope.setTag('stripe_event_type', String(context.event_type));
      }
      if (context.job_id) scope.setTag('job_id', String(context.job_id));
      if (context.action) scope.setTag('action', String(context.action));
      if (context.technical_info_id) {
        scope.setTag('technical_info_id', String(context.technical_info_id));
      }
      if (context.setup_session_id) {
        scope.setTag('setup_session_id', String(context.setup_session_id));
      }
      if (context.subdomain) {
        scope.setTag('subdomain', String(context.subdomain));
      }
      scope.setContext('ops', context);
      Sentry.captureException(error);
    });
  } catch {
    // Sentry opcional
  }
  return error;
}

/** Soft-failures `{ success:false, error }` que no lanzan excepción. */
function captureStripeFailure(messageOrErr, context = {}) {
  return captureOpsError(messageOrErr, { area: context.area || 'stripe', ...context });
}

async function flushSentry(timeoutMs = 2000) {
  try {
    if (typeof Sentry.flush === 'function') {
      await Sentry.flush(timeoutMs);
    }
  } catch {
    // Sentry opcional
  }
}

module.exports = { captureOpsError, captureStripeFailure, flushSentry };
