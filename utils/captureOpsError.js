const Sentry = require('../instrument-sentry');

function captureOpsError(err, context = {}) {
  const error = err instanceof Error ? err : new Error(String(err));
  try {
    Sentry.withScope((scope) => {
      if (context.job_id) scope.setTag('job_id', String(context.job_id));
      if (context.action) scope.setTag('action', String(context.action));
      if (context.technical_info_id) {
        scope.setTag('technical_info_id', String(context.technical_info_id));
      }
      scope.setContext('ops_job', context);
      Sentry.captureException(error);
    });
  } catch {
    // Sentry opcional
  }
  return error;
}

module.exports = { captureOpsError };
