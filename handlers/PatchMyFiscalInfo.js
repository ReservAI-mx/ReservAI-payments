const FiscalInfoManager = require('../utils/FiscalInfoManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const PatchMyFiscalInfo = async (req, res) => {
  if (req.body == null || typeof req.body.active !== 'boolean') {
    logAction(req, 'warning', 'PatchMyFiscalInfo', `invalid active account=${req.account.id}`);
    return res.status(400).json({ error: 'active (boolean) es requerido' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'PatchMyFiscalInfo', `db account=${req.account.id}`, error);
    captureStripeFailure(error, { phase: 'billing.fiscal.patch.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await FiscalInfoManager.setActive(req.account.id, req.body.active, db);
  if (!result.success) {
    if (result.status === 400 || result.status === 404) {
      logAction(req, 'warning', 'PatchMyFiscalInfo', `status=${result.status} account=${req.account.id}`);
      return res.status(result.status).json({ error: result.error });
    }
    logAction(req, 'error', 'PatchMyFiscalInfo', `patch account=${req.account.id}`);
    captureStripeFailure(result.error, { phase: 'billing.fiscal.patch' });
    return res.status(500).json({ error: result.error || 'Internal server error' });
  }

  logAction(req, 'info', 'PatchMyFiscalInfo', `ok account=${req.account.id} active=${req.body.active}`);
  return res.status(200).json({
    data: FiscalInfoManager.toPublic(result.fiscal),
    message: req.body.active ? 'información fiscal activada' : 'información fiscal desactivada',
  });
};

module.exports = PatchMyFiscalInfo;
