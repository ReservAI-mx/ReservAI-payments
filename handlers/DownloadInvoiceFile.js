const InvoiceManager = require('../utils/InvoiceManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeDownloadHandler(kind) {
  return async (req, res) => {
    const invoiceId = req.params.id;
    if (!UUID_RE.test(String(invoiceId || ''))) {
      return res.status(400).json({ error: 'id inválido' });
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
      req.account.id,
      kind,
      db
    );
    if (!result.success) {
      const status = result.status || 500;
      if (status >= 500) {
        captureStripeFailure(result.error, { phase: `billing.invoices.download.${kind}` });
      }
      return res.status(status).json({ error: result.error });
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
