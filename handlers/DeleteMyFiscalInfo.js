const FiscalInfoManager = require('../utils/FiscalInfoManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

const DeleteMyFiscalInfo = async (req, res) => {
  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    captureStripeFailure(error, { phase: 'billing.fiscal.delete.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await FiscalInfoManager.remove(req.account.id, db);
  if (!result.success) {
    if (result.status === 404) {
      return res.status(404).json({ error: result.error });
    }
    captureStripeFailure(result.error, { phase: 'billing.fiscal.delete' });
    return res.status(500).json({ error: result.error || 'Internal server error' });
  }

  return res.status(200).json({
    message: result.mode === 'soft' ? 'información fiscal archivada' : 'información fiscal eliminada',
    mode: result.mode,
  });
};

module.exports = DeleteMyFiscalInfo;
