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

function makeDownloadHandler(kind) {
  return async (req, res) => {
    const invoiceId = req.params.id;
    if (!UUID_RE.test(String(invoiceId || ''))) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const resolved = resolveAccountId(req);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }

    let db = null;
    try {
      db = await connectDB();
    } catch (error) {
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
        captureStripeFailure(result.error, { phase: `billing.invoices.download.${kind}` });
        return res.status(500).json({ error: 'Internal server error' });
      }
      const safe =
        status === 404
          ? result.error === 'INVOICE_NOT_FOUND' || result.error === 'FILE_NOT_STORED'
            ? result.error
            : 'INVOICE_NOT_FOUND'
          : 'Internal server error';
      return res.status(status === 404 ? 404 : 500).json({ error: safe });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`
    );
    return res.status(200).send(result.buffer);
  };
}

module.exports = {
  DownloadInvoicePdf: makeDownloadHandler('pdf'),
  DownloadInvoiceXml: makeDownloadHandler('xml'),
};
