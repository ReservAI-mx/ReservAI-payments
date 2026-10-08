const InvoiceManager = require('../utils/InvoiceManager');
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

function makeDownloadHandler(kind) {
  return async (req, res) => {
    const invoiceId = req.params.id;
    if (!UUID_RE.test(String(invoiceId || ''))) {
      logAction(req, 'warning', 'DownloadInvoiceFile', `invalid id kind=${kind}`);
      return res.status(400).json({ error: 'id inválido' });
    }

    const resolved = resolveAccountId(req);
    if (resolved.error) {
      logAction(req, 'warning', 'DownloadInvoiceFile', `invalid account kind=${kind}`);
      return res.status(400).json({ error: resolved.error });
    }

    let db = null;
    try {
      db = await connectDB();
    } catch (error) {
      logAction(req, 'error', 'DownloadInvoiceFile', `db id=${invoiceId} kind=${kind}`, error);
      captureStripeFailure(error, { phase: `billing.invoices.download.${kind}.connectDB` });
      return res.status(500).json({ error: 'Internal server error' });
    }

    const result = await InvoiceManager.downloadFile(
      invoiceId,
      resolved.accountId,
      kind,
      db
    );
    if (!result.success) {
      const status = result.status || 500;
      if (status >= 500) {
        logAction(req, 'error', 'DownloadInvoiceFile', `id=${invoiceId} kind=${kind} status=${status}`);
        captureStripeFailure(result.error, { phase: `billing.invoices.download.${kind}` });
        return res.status(500).json({ error: 'Internal server error' });
      }
      const safe =
        status === 404
          ? result.error === 'INVOICE_NOT_FOUND' || result.error === 'FILE_NOT_STORED'
            ? result.error
            : 'INVOICE_NOT_FOUND'
          : 'Internal server error';
      const httpStatus = status === 404 ? 404 : 500;
      logAction(req, httpStatus === 404 ? 'warning' : 'error', 'DownloadInvoiceFile', `id=${invoiceId} kind=${kind} status=${httpStatus} result=${safe}`);
      return res.status(httpStatus).json({ error: safe });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`
    );
    logAction(req, 'info', 'DownloadInvoiceFile', `ok id=${invoiceId} account=${resolved.accountId} kind=${kind}`);
    return res.status(200).send(result.buffer);
  };
}

module.exports = {
  DownloadInvoicePdf: makeDownloadHandler('pdf'),
  DownloadInvoiceXml: makeDownloadHandler('xml'),
};
