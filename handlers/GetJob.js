const { connectDB } = require('../data/connectDB');
const OpsJobManager = require('../utils/OpsJobManager');
const { logAction } = require('../utils/RequestTrace');

const GetJob = async (req, res) => {
  let db;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'GetJob', `db id=${req.params.id}`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    const result = await OpsJobManager.getById(req.params.id, db);
    if (!result.job) {
      logAction(req, 'warning', 'GetJob', `missing id=${req.params.id}`);
      return res.status(404).json({ error: 'Job no encontrado' });
    }
    logAction(req, 'info', 'GetJob', `ok id=${req.params.id} status=${result.job.status}`);
    return res.status(200).json({ job: result.job });
  } catch (err) {
    logAction(req, 'error', 'GetJob', `id=${req.params.id}`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = GetJob;
