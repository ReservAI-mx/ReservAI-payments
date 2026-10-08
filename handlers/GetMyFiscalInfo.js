const FiscalInfoManager = require('../utils/FiscalInfoManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const GetMyFiscalInfo = async (req, res) => {
  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'GetMyFiscalInfo', `db account=${req.account.id}`, error);
    captureStripeFailure(error, { phase: 'billing.fiscal.get.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await FiscalInfoManager.getByAccountId(req.account.id, db);
  if (!result.success) {
    logAction(req, 'error', 'GetMyFiscalInfo', `get account=${req.account.id}`);
    captureStripeFailure(result.error, { phase: 'billing.fiscal.get' });
    return res.status(500).json({ error: result.error || 'Internal server error' });
  }

  logAction(req, 'info', 'GetMyFiscalInfo', `ok account=${req.account.id}`);
  return res.status(200).json({
    data: FiscalInfoManager.toPublic(result.fiscal),
    disclaimer: FiscalInfoManager.getDisclaimerMeta(),
  });
};

module.exports = GetMyFiscalInfo;
