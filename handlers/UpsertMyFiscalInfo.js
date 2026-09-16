const FiscalInfoManager = require('../utils/FiscalInfoManager');
const { connectDB } = require('../data/connectDB');
const { getClientIp } = require('../utils/ClientIp');
const { captureStripeFailure } = require('../utils/captureOpsError');

const UpsertMyFiscalInfo = async (req, res) => {
  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    captureStripeFailure(error, { phase: 'billing.fiscal.put.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await FiscalInfoManager.upsert(
    req.account.id,
    req.body,
    {
      acceptedBy: req.account.id,
      acceptedIp: getClientIp(req),
    },
    db
  );

  if (!result.success) {
    if (result.status === 400) {
      return res.status(400).json({ error: result.error });
    }
    captureStripeFailure(result.error, { phase: 'billing.fiscal.put' });
    return res.status(500).json({ error: result.error || 'Internal server error' });
  }

  return res.status(200).json({
    data: FiscalInfoManager.toPublic(result.fiscal),
    message: 'información fiscal guardada',
  });
};

module.exports = UpsertMyFiscalInfo;
