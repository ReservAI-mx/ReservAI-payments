const InvoiceManager = require('../utils/InvoiceManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateInvoiceFromPayment = async (req, res) => {
  const paymentHistoryId = req.params.payment_history_id;
  if (!UUID_RE.test(String(paymentHistoryId || ''))) {
    return res.status(400).json({ error: 'payment_history_id inválido' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    captureStripeFailure(error, { phase: 'billing.invoices.create.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await InvoiceManager.createFromPayment(
    req.account.id,
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
