const { connectDB } = require('../data/connectDB');
const OpsJobManager = require('../utils/OpsJobManager');
const { logAction } = require('../utils/RequestTrace');

const RetryJob = async (req, res) => {
  let db;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'RetryJob', `db id=${req.params.id}`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    const existing = await OpsJobManager.getById(req.params.id, db);
    if (!existing.job) {
      logAction(req, 'warning', 'RetryJob', `missing id=${req.params.id}`);
      return res.status(404).json({ error: 'Job no encontrado' });
    }
    if (!['failed', 'dead'].includes(existing.job.status)) {
      logAction(req, 'warning', 'RetryJob', `status=${existing.job.status} id=${req.params.id}`);
      return res.status(409).json({
        error: 'Solo se pueden reintentar jobs failed o dead',
        status: existing.job.status,
      });
    }

    const retried = await OpsJobManager.retry(req.params.id, db);
    if (!retried.success || !retried.job) {
      logAction(req, 'warning', 'RetryJob', `not requeued id=${req.params.id}`);
      return res.status(409).json({ error: 'No se pudo reencolar el job' });
    }

    logAction(req, 'info', 'RetryJob', `ok id=${req.params.id} status=${retried.job.status}`);
    return res.status(202).json({ accepted: true, job: retried.job });
  } catch (err) {
    logAction(req, 'error', 'RetryJob', `id=${req.params.id}`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = RetryJob;
