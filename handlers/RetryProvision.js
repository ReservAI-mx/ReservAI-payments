const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const ProvisionFanout = require('../utils/ProvisionFanout');
const SetupProvisionManager = require('../utils/SetupProvisionManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const RetryProvision = async (req, res) => {
  if (req.technical_info.status !== 'pending_provision') {
    logAction(req, 'warning', 'RetryProvision', `status=${req.technical_info.status} id=${req.technical_info.id}`);
    return res.status(409).json({ error: 'No está en pending_provision' });
  }
  if (!req.technical_info.provision_error) {
    logAction(req, 'warning', 'RetryProvision', `no error id=${req.technical_info.id}`);
    return res.status(409).json({ error: 'Sin provision_error que reclamar' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'RetryProvision', `db id=${req.technical_info.id}`, error);
    captureStripeFailure(error, { phase: 'billing.provision.retry.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const claimed = await TechnicalInfoManager.claimProvisionRetry(req.technical_info.id, db);
  if (claimed.error) {
    logAction(req, 'error', 'RetryProvision', `claim id=${req.technical_info.id}`);
    captureStripeFailure(claimed.error, { phase: 'billing.provision.retry.claim' });
    return res.status(500).json({ error: claimed.error });
  }
  if (!claimed.id) {
    logAction(req, 'warning', 'RetryProvision', `claimed id=${req.technical_info.id}`);
    return res.status(409).json({ error: 'Retry ya reclamado o sin error' });
  }

  const fresh = await TechnicalInfoManager.getById(claimed.id, db);
  const tenant = fresh.tenant || req.technical_info;
  if (!tenant.encrypted_setup_json) {
    const ensured = await SetupProvisionManager.ensureEncryptedSetup(tenant, db);
    if (!ensured.success || !ensured.tenant?.encrypted_setup_json) {
      logAction(req, 'error', 'RetryProvision', `setup id=${claimed.id}`);
      captureStripeFailure(ensured.error || 'ensureEncryptedSetup failed', {
        phase: 'billing.provision.retry.ensureSetup',
        technical_info_id: claimed.id,
      });
      return res.status(502).json({ error: ensured.error || 'No se pudo armar el setup' });
    }
  }

  const fanout = await ProvisionFanout.notify(claimed.id, 'provision', db);
  if (!fanout.success) {
    logAction(req, 'error', 'RetryProvision', `fanout id=${claimed.id}`);
    captureStripeFailure(fanout.error || 'ProvisionFanout failed', {
      phase: 'billing.provision.retry.fanout',
      technical_info_id: claimed.id,
    });
    return res.status(502).json({ error: fanout.error || 'Worker no aceptó el job' });
  }

  logAction(req, 'info', 'RetryProvision', `ok id=${claimed.id}`);
  return res.status(202).json({ accepted: true, id: claimed.id });
};

module.exports = RetryProvision;
