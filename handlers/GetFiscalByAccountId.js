const FiscalInfoManager = require('../utils/FiscalInfoManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GetFiscalByAccountIdHandler = async (req, res) => {
  const accountId = req.params.account_id;
  if (!UUID_RE.test(String(accountId || ''))) {
    logAction(req, 'warning', 'GetFiscalByAccountId', 'invalid account_id');
    return res.status(400).json({ error: 'account_id inválido' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'GetFiscalByAccountId', `db account=${accountId}`, error);
    captureStripeFailure(error, { phase: 'billing.fiscal.admin.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await FiscalInfoManager.getByAccountId(accountId, db);
  if (!result.success) {
    logAction(req, 'error', 'GetFiscalByAccountId', `get account=${accountId}`);
    captureStripeFailure(result.error, { phase: 'billing.fiscal.admin.get' });
    return res.status(500).json({ error: result.error || 'Internal server error' });
  }

  logAction(req, 'info', 'GetFiscalByAccountId', `ok account=${accountId}`);
  return res.status(200).json({
    data: FiscalInfoManager.toPublic(result.fiscal),
  });
};

module.exports = GetFiscalByAccountIdHandler;
