const { connectDB } = require('../data/connectDB');
const OpsJobManager = require('../utils/OpsJobManager');

const RetryJob = async (req, res) => {
  let db;
  try {
    db = await connectDB();
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    const existing = await OpsJobManager.getById(req.params.id, db);
    if (!existing.job) {
      return res.status(404).json({ error: 'Job no encontrado' });
    }
    if (!['failed', 'dead'].includes(existing.job.status)) {
      return res.status(409).json({
        error: 'Solo se pueden reintentar jobs failed o dead',
        status: existing.job.status,
      });
    }

    const retried = await OpsJobManager.retry(req.params.id, db);
    if (!retried.success || !retried.job) {
      return res.status(409).json({ error: 'No se pudo reencolar el job' });
    }

    return res.status(202).json({ accepted: true, job: retried.job });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = RetryJob;
