const FiscalInfoManager = require('../utils/FiscalInfoManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const DeleteMyFiscalInfo = async (req, res) => {
  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'DeleteMyFiscalInfo', `db account=${req.account.id}`, error);
    captureStripeFailure(error, { phase: 'billing.fiscal.delete.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await FiscalInfoManager.remove(req.account.id, db);
  if (!result.success) {
    if (result.status === 404) {
      logAction(req, 'warning', 'DeleteMyFiscalInfo', `missing account=${req.account.id}`);
      return res.status(404).json({ error: result.error });
    }
    logAction(req, 'error', 'DeleteMyFiscalInfo', `delete account=${req.account.id}`);
    captureStripeFailure(result.error, { phase: 'billing.fiscal.delete' });
    return res.status(500).json({ error: result.error || 'Internal server error' });
  }

  logAction(req, 'info', 'DeleteMyFiscalInfo', `ok account=${req.account.id} mode=${result.mode}`);
  return res.status(200).json({
    message: result.mode === 'soft' ? 'información fiscal archivada' : 'información fiscal eliminada',
    mode: result.mode,
  });
};

module.exports = DeleteMyFiscalInfo;
