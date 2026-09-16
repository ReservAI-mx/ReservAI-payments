const { DateTime } = require('luxon');
const { v4: uuidv4 } = require('uuid');
const FiscalInfoManager = require('./FiscalInfoManager');
const FacturamaClient = require('./FacturamaClient');
const SupabaseStorageManager = require('./SupabaseStorageManager');
const EmailManager = require('./EmailManager');
const GetPaymentHistoryForAccount = require('../queries/GetPaymentHistoryForAccount');
const GetInvoiceForAccount = require('../queries/GetInvoiceForAccount');
const InsertInvoice = require('../queries/InsertInvoice');
const LinkPaymentHistoryInvoice = require('../queries/LinkPaymentHistoryInvoice');

const TZ = 'America/Mexico_City';

class InvoiceManager {
  static isPaymentInCurrentMonth(createdAt) {
    if (!createdAt) return false;
    const payment = DateTime.fromJSDate(new Date(createdAt), { zone: TZ });
    if (!payment.isValid) return false;
    const now = DateTime.now().setZone(TZ);
    return payment.year === now.year && payment.month === now.month;
  }

  static toPublic(row) {
    if (!row) return null;
    return {
      id: row.id,
      payment_history_id: row.payment_history_id,
      info_fiscal_id: row.info_fiscal_id,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      invoice_amount: row.invoice_amount,
      status: row.status,
      facturama_invoice_id: row.facturama_invoice_id,
      facturama_uuid: row.facturama_uuid,
      pdf_storage_path: row.pdf_storage_path,
      xml_storage_path: row.xml_storage_path,
      created_at: row.created_at,
    };
  }

  static splitAmountWithIva(totalAmount) {
    const total = Math.round(Number(totalAmount) * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) {
      return { error: 'monto de pago inválido' };
    }
    const subtotal = Math.round((total / 1.16) * 100) / 100;
    const tax = Math.round((total - subtotal) * 100) / 100;
    return { total, subtotal, tax };
  }

  static buildCfdiPayload(fiscal, payment, amounts) {
    const expeditionPlace =
      process.env.FACTURAMA_EXPEDITION_PLACE || fiscal.codigo_postal;
    const paymentForm = process.env.FACTURAMA_PAYMENT_FORM || '03';
    const productCode = process.env.FACTURAMA_PRODUCT_CODE || '81112100';
    const unitCode = process.env.FACTURAMA_UNIT_CODE || 'E48';

    return {
      CfdiType: 'I',
      NameId: 1,
      ExpeditionPlace: String(expeditionPlace),
      PaymentForm: String(paymentForm),
      PaymentMethod: 'PUE',
      Exportation: '01',
      Receiver: {
        Name: fiscal.razon_social,
        CfdiUse: fiscal.uso_cfdi || 'G01',
        Rfc: fiscal.rfc,
        FiscalRegime: fiscal.regimen_fiscal,
        TaxZipCode: fiscal.codigo_postal,
      },
      Items: [
        {
          Quantity: 1,
          ProductCode: productCode,
          UnitCode: unitCode,
          Unit: 'Servicio',
          Description: `Servicio ReservAI — cobro ${payment.stripe_invoice_id || payment.id}`,
          UnitPrice: amounts.subtotal,
          Subtotal: amounts.subtotal,
          TaxObject: '02',
          Taxes: [
            {
              Name: 'IVA',
              Rate: 0.16,
              Total: amounts.tax,
              Base: amounts.subtotal,
              IsRetention: false,
              IsFederalTax: true,
            },
          ],
          Total: amounts.total,
        },
      ],
    };
  }

  static async getPaymentForAccount(paymentHistoryId, accountId, db) {
    try {
      const result = await db.query(GetPaymentHistoryForAccount, [
        paymentHistoryId,
        accountId,
      ]);
      return { success: true, payment: result.rows[0] || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async getInvoiceForAccount(invoiceId, accountId, db) {
    try {
      const result = await db.query(GetInvoiceForAccount, [invoiceId, accountId]);
      return { success: true, invoice: result.rows[0] || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async createFromPayment(accountId, paymentHistoryId, customerEmail, db) {
    const looked = await InvoiceManager.getPaymentForAccount(
      paymentHistoryId,
      accountId,
      db
    );
    if (!looked.success) {
      return { success: false, error: looked.error, status: 500 };
    }
    if (!looked.payment) {
      return { success: false, error: 'PAYMENT_NOT_FOUND', status: 404 };
    }

    const payment = looked.payment;
    if (payment.existing_invoice_id) {
      const existing = await InvoiceManager.getInvoiceForAccount(
        payment.existing_invoice_id,
        accountId,
        db
      );
      if (!existing.success) {
        return { success: false, error: existing.error, status: 500 };
      }
      return {
        success: true,
        already_exists: true,
        invoice: InvoiceManager.toPublic(existing.invoice),
      };
    }

    if (!InvoiceManager.isPaymentInCurrentMonth(payment.created_at)) {
      return { success: false, error: 'MONTH_EXPIRED', status: 409 };
    }

    const fiscalResult = await FiscalInfoManager.getByAccountId(accountId, db);
    if (!fiscalResult.success) {
      return { success: false, error: fiscalResult.error, status: 500 };
    }
    const fiscal = fiscalResult.fiscal;
    if (!fiscal || !fiscal.active || !fiscal.authorization_accepted) {
      return { success: false, error: 'FISCAL_NOT_READY', status: 400 };
    }

    const amounts = InvoiceManager.splitAmountWithIva(payment.amount);
    if (amounts.error) {
      return { success: false, error: amounts.error, status: 400 };
    }

    const payload = InvoiceManager.buildCfdiPayload(fiscal, payment, amounts);
    const stamped = await FacturamaClient.createCfdi(payload);
    if (!stamped.success) {
      return {
        success: false,
        error: stamped.error || 'FACTURAMA_STAMP_FAILED',
        status: 502,
      };
    }

    const facturamaId = stamped.data.Id || stamped.data.id;
    const uuid =
      stamped.data?.Complement?.TaxStamp?.Uuid ||
      stamped.data?.Complement?.TaxStamp?.UUID ||
      null;
    const folio = stamped.data.Folio != null ? String(stamped.data.Folio) : null;

    if (!facturamaId) {
      return { success: false, error: 'FACTURAMA_MISSING_ID', status: 502 };
    }

    const [pdfRes, xmlRes] = await Promise.all([
      FacturamaClient.downloadIssued('pdf', facturamaId),
      FacturamaClient.downloadIssued('xml', facturamaId),
    ]);
    if (!pdfRes.success) {
      return { success: false, error: pdfRes.error || 'PDF_DOWNLOAD_FAILED', status: 502 };
    }
    if (!xmlRes.success) {
      return { success: false, error: xmlRes.error || 'XML_DOWNLOAD_FAILED', status: 502 };
    }

    const fileId = uuidv4();
    const pdfPath = `invoices/${accountId}/${paymentHistoryId}/${fileId}.pdf`;
    const xmlPath = `invoices/${accountId}/${paymentHistoryId}/${fileId}.xml`;

    const pdfUpload = await SupabaseStorageManager.upload(
      pdfPath,
      pdfRes.buffer,
      'application/pdf'
    );
    if (!pdfUpload.success) {
      return { success: false, error: pdfUpload.error || 'PDF_UPLOAD_FAILED', status: 500 };
    }
    const xmlUpload = await SupabaseStorageManager.upload(
      xmlPath,
      xmlRes.buffer,
      'application/xml'
    );
    if (!xmlUpload.success) {
      return { success: false, error: xmlUpload.error || 'XML_UPLOAD_FAILED', status: 500 };
    }

    let invoiceRow;
    try {
      const inserted = await db.query(InsertInvoice, [
        paymentHistoryId,
        fiscal.id,
        folio,
        new Date(),
        amounts.total,
        facturamaId,
        null,
        uuid,
        pdfPath,
        xmlPath,
      ]);
      invoiceRow = inserted.rows[0];
      await db.query(LinkPaymentHistoryInvoice, [paymentHistoryId, invoiceRow.id]);
    } catch (error) {
      return { success: false, error: error.message, status: 500 };
    }

    if (customerEmail) {
      await EmailManager.sendEmailToCustomer(
        customerEmail,
        'Tu factura CFDI — ReservAI',
        `<p>Adjuntamos tu factura CFDI (PDF y XML) correspondiente al cobro.</p>
         <p>UUID: ${uuid || '—'}</p>`,
        `Factura CFDI UUID: ${uuid || '—'}`,
        [
          { filename: `factura-${folio || fileId}.pdf`, content: pdfRes.buffer },
          { filename: `factura-${folio || fileId}.xml`, content: xmlRes.buffer },
        ]
      );
    }

    return {
      success: true,
      already_exists: false,
      invoice: InvoiceManager.toPublic(invoiceRow),
    };
  }

  static async downloadFile(invoiceId, accountId, kind, db) {
    const looked = await InvoiceManager.getInvoiceForAccount(invoiceId, accountId, db);
    if (!looked.success) {
      return { success: false, error: looked.error, status: 500 };
    }
    if (!looked.invoice) {
      return { success: false, error: 'INVOICE_NOT_FOUND', status: 404 };
    }

    const path =
      kind === 'xml'
        ? looked.invoice.xml_storage_path
        : looked.invoice.pdf_storage_path;
    if (!path) {
      return { success: false, error: 'FILE_NOT_STORED', status: 404 };
    }

    const file = await SupabaseStorageManager.download(path);
    if (!file.success) {
      return { success: false, error: file.error || 'DOWNLOAD_FAILED', status: 500 };
    }

    return {
      success: true,
      buffer: file.buffer,
      contentType: kind === 'xml' ? 'application/xml' : 'application/pdf',
      filename:
        kind === 'xml'
          ? `factura-${looked.invoice.invoice_number || invoiceId}.xml`
          : `factura-${looked.invoice.invoice_number || invoiceId}.pdf`,
    };
  }

  static async getTicketPdfUrl(paymentHistoryId, accountId, db, stripe) {
    const looked = await InvoiceManager.getPaymentForAccount(
      paymentHistoryId,
      accountId,
      db
    );
    if (!looked.success) {
      return { success: false, error: looked.error, status: 500 };
    }
    if (!looked.payment) {
      return { success: false, error: 'PAYMENT_NOT_FOUND', status: 404 };
    }

    if (looked.payment.ticket_pdf) {
      return { success: true, url: looked.payment.ticket_pdf };
    }

    const stripeInvoiceId = looked.payment.stripe_invoice_id;
    if (!stripeInvoiceId) {
      return { success: false, error: 'STRIPE_INVOICE_MISSING', status: 404 };
    }

    try {
      const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
      const url = invoice.invoice_pdf || invoice.hosted_invoice_url;
      if (!url) {
        return { success: false, error: 'STRIPE_PDF_UNAVAILABLE', status: 404 };
      }
      return { success: true, url };
    } catch (error) {
      return { success: false, error: error.message, status: 502 };
    }
  }
}

module.exports = InvoiceManager;
