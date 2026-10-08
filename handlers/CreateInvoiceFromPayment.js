const InvoiceManager = require('../utils/InvoiceManager');
const EmailManager = require('../utils/EmailManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Errores de negocio que sí puede ver el cliente. El resto → Internal server error. */
const CLIENT_SAFE = new Set([
  'MONTH_EXPIRED',
  'FISCAL_NOT_READY',
  'PAYMENT_NOT_FOUND',
  'FACTURAMA_UNAVAILABLE',
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
    const out = { status, error: code };
    if (code === 'FACTURAMA_UNAVAILABLE') {
      out.status = status === 502 ? 503 : status || 503;
    }
    return out;
  }
  if (status === 404) {
    return { status: 404, error: 'PAYMENT_NOT_FOUND' };
  }
  // Facturama (sello, CSD, ExpeditionPlace), storage, etc. → genérico.
  return { status: 500, error: 'Internal server error' };
}

function notifyInternalInvoiceFailure(req, {
  accountId,
  paymentHistoryId,
  email,
  name,
  detail,
}) {
  const subject = '[ReservAI] Falló solicitud de factura';
  const safeDetail = String(detail || 'FACTURAMA_UNAVAILABLE').slice(0, 500);
  const text = [
    'Falló una solicitud manual de factura (Facturama no disponible).',
    `account_id: ${accountId}`,
    `payment_history_id: ${paymentHistoryId}`,
    `email: ${email || '—'}`,
    `nombre: ${name || '—'}`,
    `error: ${safeDetail}`,
  ].join('\n');
  const html = `<p>Falló una solicitud manual de factura (Facturama no disponible).</p>
<ul>
<li><strong>account_id:</strong> ${accountId}</li>
<li><strong>payment_history_id:</strong> ${paymentHistoryId}</li>
<li><strong>email:</strong> ${email || '—'}</li>
<li><strong>nombre:</strong> ${name || '—'}</li>
<li><strong>error:</strong> ${safeDetail}</li>
</ul>`;

  Promise.resolve()
    .then(() => EmailManager.sendEmailToInternalTeam(subject, html, text))
    .then((sent) => {
      if (!sent?.success) {
        logAction(req, 'error', 'CreateInvoiceFromPayment', `alert email payment=${paymentHistoryId} account=${accountId}`);
        if (req.trace) req.trace.flush(500).catch(() => {});
      }
    })
    .catch((err) => {
      logAction(req, 'error', 'CreateInvoiceFromPayment', `alert email payment=${paymentHistoryId} account=${accountId}`, err);
      if (req.trace) req.trace.flush(500).catch(() => {});
    });
}

const CreateInvoiceFromPayment = async (req, res) => {
  const paymentHistoryId = req.params.payment_history_id;
  if (!UUID_RE.test(String(paymentHistoryId || ''))) {
    logAction(req, 'warning', 'CreateInvoiceFromPayment', 'invalid payment_history_id');
    return res.status(400).json({ error: 'payment_history_id inválido' });
  }

  const resolved = resolveAccountId(req);
  if (resolved.error) {
    logAction(req, 'warning', 'CreateInvoiceFromPayment', 'invalid account_id');
    return res.status(400).json({ error: resolved.error });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'CreateInvoiceFromPayment', `db payment=${paymentHistoryId}`, error);
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
    const failMsg = `payment=${paymentHistoryId} account=${resolved.accountId} status=${client.status} result=${client.error}`;
    logAction(req, client.status >= 500 ? 'error' : 'warning', 'CreateInvoiceFromPayment', failMsg);
    if (client.error === 'FACTURAMA_UNAVAILABLE') {
      notifyInternalInvoiceFailure(req, {
        accountId: resolved.accountId,
        paymentHistoryId,
        email: req.account?.email,
        name: req.account?.name,
        detail: result.detail || result.error,
      });
      captureStripeFailure(result.detail || result.error, {
        phase: 'billing.invoices.create',
        area: 'facturama',
        payment_history_id: paymentHistoryId,
        account_id: resolved.accountId,
        internal_status: result.status || 503,
      });
      return res.status(client.status).json({ error: client.error });
    }
    if (client.status >= 500 || !CLIENT_SAFE.has(String(result.error || ''))) {
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

  logAction(req, 'info', 'CreateInvoiceFromPayment', `ok payment=${paymentHistoryId} account=${resolved.accountId} already_exists=${!!result.already_exists}`);
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
module.exports.notifyInternalInvoiceFailure = notifyInternalInvoiceFailure;
