const FiscalInfoManager = require('../utils/FiscalInfoManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

const PatchMyFiscalInfo = async (req, res) => {
  if (req.body == null || typeof req.body.active !== 'boolean') {
    return res.status(400).json({ error: 'active (boolean) es requerido' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    captureStripeFailure(error, { phase: 'billing.fiscal.patch.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await FiscalInfoManager.setActive(req.account.id, req.body.active, db);
  if (!result.success) {
    if (result.status === 400 || result.status === 404) {
      return res.status(result.status).json({ error: result.error });
    }
    captureStripeFailure(result.error, { phase: 'billing.fiscal.patch' });
    return res.status(500).json({ error: result.error || 'Internal server error' });
  }

  return res.status(200).json({
    data: FiscalInfoManager.toPublic(result.fiscal),
    message: req.body.active ? 'información fiscal activada' : 'información fiscal desactivada',
  });
};

module.exports = PatchMyFiscalInfo;
