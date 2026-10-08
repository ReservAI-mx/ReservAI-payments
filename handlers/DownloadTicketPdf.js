const InvoiceManager = require('../utils/InvoiceManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveAccountId(req) {
  if (req.params.account_id) {
    if (!UUID_RE.test(String(req.params.account_id))) {
      return { error: 'account_id inválido' };
    }
    return { accountId: req.params.account_id };
  }
  return { accountId: req.account.id };
}

const DownloadTicketPdf = async (req, res) => {
  const paymentHistoryId = req.params.payment_history_id;
  if (!UUID_RE.test(String(paymentHistoryId || ''))) {
    logAction(req, 'warning', 'DownloadTicketPdf', 'invalid payment_history_id');
    return res.status(400).json({ error: 'payment_history_id inválido' });
  }

  const resolved = resolveAccountId(req);
  if (resolved.error) {
    logAction(req, 'warning', 'DownloadTicketPdf', 'invalid account_id');
    return res.status(400).json({ error: resolved.error });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'DownloadTicketPdf', `db payment=${paymentHistoryId}`, error);
    captureStripeFailure(error, { phase: 'billing.tickets.pdf.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  let stripe = null;
  try {
    stripe = await getStripeInstance();
  } catch (error) {
    logAction(req, 'error', 'DownloadTicketPdf', `stripe payment=${paymentHistoryId}`, error);
    captureStripeFailure(error, { phase: 'billing.tickets.pdf.getStripe' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await InvoiceManager.getTicketPdfUrl(
    paymentHistoryId,
    resolved.accountId,
    db,
    stripe
  );
  if (!result.success) {
    const status = result.status || 500;
    const level = status === 404 || status === 400 || status === 403 || status === 401 ? 'warning' : 'error';
    logAction(req, level, 'DownloadTicketPdf', `payment=${paymentHistoryId} account=${resolved.accountId} status=${status}`);
    if (status >= 500) {
      captureStripeFailure(result.error, { phase: 'billing.tickets.pdf' });
    }
    return res.status(status).json({ error: result.error });
  }

  logAction(req, 'info', 'DownloadTicketPdf', `ok payment=${paymentHistoryId} account=${resolved.accountId}`);
  return res.redirect(302, result.url);
};

module.exports = DownloadTicketPdf;
