const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const ProvisionFanout = require('../utils/ProvisionFanout');
const { connectDB } = require('../data/connectDB');

const RetryProvision = async (req, res) => {
  if (req.technical_info.status !== 'pending_provision') {
    return res.status(409).json({ error: 'No está en pending_provision' });
  }
  if (!req.technical_info.provision_error) {
    return res.status(409).json({ error: 'Sin provision_error que reclamar' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }

  const claimed = await TechnicalInfoManager.claimProvisionRetry(req.technical_info.id, db);
  if (claimed.error) {
    return res.status(500).json({ error: claimed.error });
  }
  if (!claimed.id) {
    return res.status(409).json({ error: 'Retry ya reclamado o sin error' });
  }

  const fanout = await ProvisionFanout.notify(claimed.id, 'provision', db);
  if (!fanout.success) {
    return res.status(502).json({ error: fanout.error || 'Worker no aceptó el job' });
  }

  return res.status(202).json({ accepted: true, id: claimed.id });
};

module.exports = RetryProvision;
