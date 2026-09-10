const { connectDB } = require('../data/connectDB');
const OpsJobManager = require('../utils/OpsJobManager');

const GetJob = async (req, res) => {
  let db;
  try {
    db = await connectDB();
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    const result = await OpsJobManager.getById(req.params.id, db);
    if (!result.job) {
      return res.status(404).json({ error: 'Job no encontrado' });
    }
    return res.status(200).json({ job: result.job });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = GetJob;
