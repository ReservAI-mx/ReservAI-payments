const FiscalInfoManager = require('../utils/FiscalInfoManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

const GetMyFiscalInfo = async (req, res) => {
  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    captureStripeFailure(error, { phase: 'billing.fiscal.get.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await FiscalInfoManager.getByAccountId(req.account.id, db);
  if (!result.success) {
    captureStripeFailure(result.error, { phase: 'billing.fiscal.get' });
    return res.status(500).json({ error: result.error || 'Internal server error' });
  }

  return res.status(200).json({
    data: FiscalInfoManager.toPublic(result.fiscal),
    disclaimer: FiscalInfoManager.getDisclaimerMeta(),
  });
};

module.exports = GetMyFiscalInfo;
