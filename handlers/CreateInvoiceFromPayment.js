const InvoiceManager = require('../utils/InvoiceManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Errores de negocio que sí puede ver el cliente. El resto → Internal server error. */
const CLIENT_SAFE = new Set([
  'MONTH_EXPIRED',
  'FISCAL_NOT_READY',
  'PAYMENT_NOT_FOUND',
  'monto de pago inválido',
]);

function resolveAccountId(req) {
  if (req.params.account_id) {
    if (!UUID_RE.test(String(req.params.account_id))) {
      return { error: 'account_id inválido' };
    }
    return { accountId: req.params.account_id };
  }
  return { accountId: req.account.id };
}

function toClientError(result) {
  const status = result.status || 500;
  const code = String(result.error || '');
  if (CLIENT_SAFE.has(code)) {
    return { status, error: code };
  }
  if (status === 404) {
    return { status: 404, error: 'PAYMENT_NOT_FOUND' };
  }
  // Facturama (sello, CSD, ExpeditionPlace), storage, etc. → genérico.
  return { status: 500, error: 'Internal server error' };
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
    const client = toClientError(result);
    if (client.status >= 500 || !CLIENT_SAFE.has(String(result.error || ''))) {
      // Detalle real (sello, CSD, Facturama JSON) solo a Sentry.
      captureStripeFailure(result.error, {
        phase: 'billing.invoices.create',
        area: 'facturama',
        payment_history_id: paymentHistoryId,
        account_id: resolved.accountId,
        internal_status: result.status || 500,
      });
    }
    return res.status(client.status).json({ error: client.error });
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
module.exports.toClientError = toClientError;
module.exports.CLIENT_SAFE = CLIENT_SAFE;
