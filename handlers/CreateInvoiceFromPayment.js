const InvoiceManager = require('../utils/InvoiceManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

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

const CreateInvoiceFromPayment = async (req, res) => {
  const paymentHistoryId = req.params.payment_history_id;
  if (!UUID_RE.test(String(paymentHistoryId || ''))) {
    return res.status(400).json({ error: 'payment_history_id inválido' });
  }

  const resolved = resolveAccountId(req);
  if (resolved.error) {
    return res.status(400).json({ error: resolved.error });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    captureStripeFailure(error, { phase: 'billing.invoices.create.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await InvoiceManager.createFromPayment(
    resolved.accountId,
    paymentHistoryId,
    req.account.email,
    db
  );

  if (!result.success) {
    const status = result.status || 500;
    if (status >= 500) {
      captureStripeFailure(result.error, { phase: 'billing.invoices.create' });
    }
    return res.status(status).json({ error: result.error });
  }

  return res.status(result.already_exists ? 200 : 201).json({
    data: result.invoice,
    already_exists: !!result.already_exists,
    message: result.already_exists
      ? 'factura ya existente'
      : 'factura generada y enviada por correo',
  });
};

module.exports = CreateInvoiceFromPayment;
