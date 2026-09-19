const Sentry = require('../instrument-sentry');

function toError(err) {
  if (err instanceof Error) return err;
  if (typeof err === 'string') {
    if (err === '{}' || err === '[]') {
      return new Error('empty error payload from upstream (revisa logs de Facturama/API)');
    }
    return new Error(err);
  }
  if (err && typeof err === 'object') {
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}' && json !== '[]') return new Error(json);
    } catch {
      /* ignore */
    }
    return new Error('empty error object from upstream');
  }
  return new Error(String(err));
}

function captureOpsError(err, context = {}) {
  const error = toError(err);
  const phase = context.phase || context.area || 'ops';
  const extras = [];
  if (context.event_type) extras.push(`event=${context.event_type}`);
  if (context.job_id) extras.push(`job=${context.job_id}`);
  if (context.action) extras.push(`action=${context.action}`);
  if (context.technical_info_id) extras.push(`ti=${context.technical_info_id}`);
  if (context.subdomain) extras.push(`sub=${context.subdomain}`);
  if (error.type) extras.push(`stripe_type=${error.type}`);
  if (error.code) extras.push(`code=${error.code}`);
  const suffix = extras.length ? ` (${extras.join(' ')})` : '';
  console.error(`[stripe][${phase}] ${error.message}${suffix}`);
  if (error.stack) {
    console.error(error.stack);
  }
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
