const InvoiceManager = require('../utils/InvoiceManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePaging(query) {
  const limit = query?.limit != null ? Number(query.limit) : 20;
  const offset = query?.offset != null ? Number(query.offset) : 0;
  return { limit, offset };
}

const ListMyPayments = async (req, res) => {
  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'ListMyPayments', `db account=${req.account.id}`, error);
    captureStripeFailure(error, { phase: 'billing.payments.list.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await InvoiceManager.listByAccount(
    req.account.id,
    parsePaging(req.query),
    db
  );
  if (!result.success) {
    const status = result.status || 500;
    logAction(req, status === 404 || status === 400 ? 'warning' : 'error', 'ListMyPayments', `account=${req.account.id} status=${status}`);
    captureStripeFailure(result.error, { phase: 'billing.payments.list' });
    return res.status(status).json({ error: result.error });
  }

  logAction(req, 'info', 'ListMyPayments', `ok account=${req.account.id} count=${result.payments.length}`);
  return res.status(200).json({
    data: result.payments,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    message: 'pagos obtenidos',
  });
};

const ListAccountPayments = async (req, res) => {
  const accountId = req.params.account_id;
  if (!UUID_RE.test(String(accountId || ''))) {
    logAction(req, 'warning', 'ListAccountPayments', 'invalid account_id');
    return res.status(400).json({ error: 'account_id inválido' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'ListAccountPayments', `db account=${accountId}`, error);
    captureStripeFailure(error, { phase: 'billing.payments.admin.list.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await InvoiceManager.listByAccount(
    accountId,
    parsePaging(req.query),
    db
  );
  if (!result.success) {
    const status = result.status || 500;
    logAction(req, status === 404 || status === 400 ? 'warning' : 'error', 'ListAccountPayments', `account=${accountId} status=${status}`);
    captureStripeFailure(result.error, { phase: 'billing.payments.admin.list' });
    return res.status(status).json({ error: result.error });
  }

  logAction(req, 'info', 'ListAccountPayments', `ok account=${accountId} count=${result.payments.length}`);
  return res.status(200).json({
    data: result.payments,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    message: 'pagos obtenidos',
  });
};

module.exports = { ListMyPayments, ListAccountPayments };
