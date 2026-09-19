const { DateTime } = require('luxon');
const { v4: uuidv4 } = require('uuid');
const FiscalInfoManager = require('./FiscalInfoManager');
const FacturamaClient = require('./FacturamaClient');
const SupabaseStorageManager = require('./SupabaseStorageManager');
const EmailManager = require('./EmailManager');
const ProductsManager = require('./ProductsManager');
const GetPaymentHistoryForAccount = require('../queries/GetPaymentHistoryForAccount');
const ListPaymentHistoryByAccount = require('../queries/ListPaymentHistoryByAccount');
const CountPaymentHistoryByAccount = require('../queries/CountPaymentHistoryByAccount');
const GetInvoiceForAccount = require('../queries/GetInvoiceForAccount');
const InsertInvoice = require('../queries/InsertInvoice');
const LinkPaymentHistoryInvoice = require('../queries/LinkPaymentHistoryInvoice');
const UpdatePaymentHistoryTicketStorage = require('../queries/UpdatePaymentHistoryTicketStorage');
const GetAccountAndPlanBySubscriptionId = require('../queries/GetAccountAndPlanBySubscriptionId');
const PaymentDocumentsMessage = require('../views/PaymentDocuments');
const getStripeInstance = require('../data/StripeInstanceGetter');

const TZ = 'America/Mexico_City';

class InvoiceManager {
  static isPaymentInCurrentMonth(createdAt) {
    if (!createdAt) return false;
    const payment = DateTime.fromJSDate(new Date(createdAt), { zone: TZ });
    if (!payment.isValid) return false;
    const now = DateTime.now().setZone(TZ);
    return payment.year === now.year && payment.month === now.month;
  }

  static fiscalReadyForInvoice(fiscal) {
    return !!(
      fiscal &&
      fiscal.active &&
      fiscal.authorization_accepted &&
      fiscal.sat_validation_status === 'valid'
    );
  }

  static enrichPaymentListItem(row, fiscal) {
    const invoiceId = row.invoice_id || null;
    const inMonth = InvoiceManager.isPaymentInCurrentMonth(row.created_at);
    const fiscalReady = InvoiceManager.fiscalReadyForInvoice(fiscal);

    let can_invoice = false;
    let invoice_blocked_reason = null;
    if (invoiceId) {
      invoice_blocked_reason = 'already_invoiced';
    } else if (!inMonth) {
      invoice_blocked_reason = 'month_expired';
    } else if (!fiscalReady) {
      invoice_blocked_reason = 'fiscal_not_ready';
    } else {
      can_invoice = true;
    }

    const ticket_available = !!(
      row.ticket_pdf ||
      row.ticket_storage_path ||
      (row.stripe_invoice_id && String(row.stripe_invoice_id).startsWith('in_'))
    );

    return {
      id: row.id,
      created_at: row.created_at,
      amount: row.amount,
      status: row.status,
      stripe_invoice_id: row.stripe_invoice_id,
      stripe_checkout_session_id: row.stripe_checkout_session_id,
      ticket_available,
      invoice_id: invoiceId,
      invoice_number: row.invoice_number || null,
      facturama_uuid: row.facturama_uuid || null,
      can_invoice,
      invoice_blocked_reason,
    };
  }

  static async listByAccount(accountId, { limit = 20, offset = 0 } = {}, db) {
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const off = Math.max(Number(offset) || 0, 0);
    try {
      const [listResult, countResult, fiscalResult] = await Promise.all([
        db.query(ListPaymentHistoryByAccount, [accountId, lim, off]),
        db.query(CountPaymentHistoryByAccount, [accountId]),
        FiscalInfoManager.getByAccountId(accountId, db),
      ]);
      if (!fiscalResult.success) {
        return { success: false, error: fiscalResult.error, status: 500 };
      }
      const fiscal = fiscalResult.fiscal;
      const payments = (listResult.rows || []).map((row) =>
        InvoiceManager.enrichPaymentListItem(row, fiscal)
      );
      return {
        success: true,
        payments,
        total: countResult.rows[0]?.count || 0,
        limit: lim,
        offset: off,
      };
    } catch (error) {
      return { success: false, error: error.message, status: 500 };
    }
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

  static splitAmountWithIva(totalAmount, { isrRetention = false } = {}) {
    const total = Math.round(Number(totalAmount) * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) {
      return { error: 'monto de pago inválido' };
    }

    // Sin retención: total cobrado = subtotal + IVA 16%.
    if (!isrRetention) {
      const subtotal = Math.round((total / 1.16) * 100) / 100;
      const tax = Math.round((total - subtotal) * 100) / 100;
      return { total, subtotal, tax, isr_retention: 0 };
    }

    // Con ISR 1.25% retenido: total = subtotal + IVA − ISR.
    // Así el Total del CFDI coincide con lo cobrado en Stripe (precio moral).
    const FACTOR = 1.16 - 0.0125; // 1.1475
    const subtotal = Math.round((total / FACTOR) * 100) / 100;
    let tax = Math.round(subtotal * 0.16 * 100) / 100;
    const isr_retention = Math.round(subtotal * 0.0125 * 100) / 100;
    const computed = Math.round((subtotal + tax - isr_retention) * 100) / 100;
    const diff = Math.round((total - computed) * 100) / 100;
    if (diff !== 0) {
      tax = Math.round((tax + diff) * 100) / 100;
    }
    return { total, subtotal, tax, isr_retention };
  }

  static shouldApplyIsrRetention(fiscal) {
    return !!(fiscal && fiscal.persona_moral);
  }

  static buildCfdiPayload(fiscal, payment, amounts, productCodes = {}) {
    const expeditionPlace =
      process.env.FACTURAMA_EXPEDITION_PLACE || fiscal.codigo_postal;
    const paymentForm = process.env.FACTURAMA_PAYMENT_FORM || '03';
    const productCode =
      productCodes.code_prod_serv ||
      process.env.FACTURAMA_PRODUCT_CODE ||
      '81112100';
    const unitCode =
      productCodes.unit_code || process.env.FACTURAMA_UNIT_CODE || 'E48';
    const unit = productCodes.unit || 'Servicio';

    const taxes = [
      {
        Name: 'IVA',
        Rate: 0.16,
        Total: amounts.tax,
        Base: amounts.subtotal,
        IsRetention: false,
        IsFederalTax: true,
      },
    ];

    const isr = Number(amounts.isr_retention) || 0;
    if (isr > 0) {
      taxes.push({
        Name: 'ISR',
        Rate: 0.0125,
        Total: isr,
        Base: amounts.subtotal,
        IsRetention: true,
        IsFederalTax: true,
      });
    }

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
          Unit: unit,
          Description: `Servicio ReservAI — cobro ${payment.stripe_invoice_id || payment.id}`,
          UnitPrice: amounts.subtotal,
          Subtotal: amounts.subtotal,
          TaxObject: '02',
          Taxes: taxes,
          // Subtotal + IVA traslado − ISR retenido (= monto cobrado).
          Total: amounts.total,
        },
      ],
    };
  }

  static async resolveProductCodes(stripeSubscriptionId, db, plannedPlanOverride = null) {
    const empty = {
      code_prod_serv: null,
      unit_code: null,
      unit: null,
    };
    try {
      let planned = plannedPlanOverride;
      if (!planned && stripeSubscriptionId) {
        const looked = await db.query(GetAccountAndPlanBySubscriptionId, [
          stripeSubscriptionId,
        ]);
        planned = looked.rows[0]?.planned_plan;
      }
      if (!planned) return empty;
      const found = await ProductsManager.findForCheckout(planned, db);
      if (!found.success || !found.product) return empty;
      return {
        code_prod_serv: found.product.facturama_code_prod_serv || null,
        unit_code: found.product.facturama_unit_code || null,
        unit: found.product.facturama_unit || null,
      };
    } catch {
      return empty;
    }
  }

  static async getAccountAndPlanBySubscriptionId(stripeSubscriptionId, db) {
    try {
      const result = await db.query(GetAccountAndPlanBySubscriptionId, [
        stripeSubscriptionId,
      ]);
      return { success: true, row: result.rows[0] || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
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

  static async downloadStripeInvoicePdf(invoicePdfUrl) {
    if (!invoicePdfUrl || typeof invoicePdfUrl !== 'string') {
      return { success: false, error: 'STRIPE_PDF_URL_MISSING' };
    }
    try {
      const response = await fetch(invoicePdfUrl);
      if (!response.ok) {
        return {
          success: false,
          error: `STRIPE_PDF_DOWNLOAD_FAILED:${response.status}`,
        };
      }
      const ab = await response.arrayBuffer();
      return { success: true, buffer: Buffer.from(ab) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async sendPaymentDocumentsEmail({
    email,
    name,
    stripePdfBuffer,
    cfdiPdf,
    cfdiXml,
    meta = {},
  }) {
    if (!email) {
      return { success: false, error: 'EMAIL_MISSING' };
    }
    const enrichedMeta = {
      ...meta,
      has_ticket: !!stripePdfBuffer,
      has_cfdi: !!(cfdiPdf && cfdiXml),
    };
    const msg = PaymentDocumentsMessage.getMessage(name || 'cliente', enrichedMeta);
    const attachments = [];
    if (stripePdfBuffer) {
      attachments.push({
        filename: `ticket-stripe-${meta.number || 'invoice'}.pdf`,
        content: stripePdfBuffer,
      });
    }
    if (cfdiPdf) {
      attachments.push({
        filename: `factura-${meta.folio || 'cfdi'}.pdf`,
        content: cfdiPdf,
      });
    }
    if (cfdiXml) {
      attachments.push({
        filename: `factura-${meta.folio || 'cfdi'}.xml`,
        content: cfdiXml,
      });
    }
    if (attachments.length === 0) {
      return { success: false, error: 'NO_ATTACHMENTS' };
    }
    return EmailManager.sendEmailToCustomer(
      email,
      msg.subject,
      msg.content,
      msg.text_content,
      attachments
    );
  }

  /**
   * @param {object} [options]
   * @param {boolean} [options.sendEmail=true]
   * @returns {Promise<object>}
   */
  static async createFromPayment(
    accountId,
    paymentHistoryId,
    customerEmail,
    db,
    options = {}
  ) {
    const sendEmail = options.sendEmail !== false;

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
        pdfBuffer: null,
        xmlBuffer: null,
        folio: existing.invoice?.invoice_number || null,
        uuid: existing.invoice?.facturama_uuid || null,
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
    if (
      !fiscal ||
      !fiscal.active ||
      !fiscal.authorization_accepted ||
      fiscal.sat_validation_status !== 'valid'
    ) {
      return { success: false, error: 'FISCAL_NOT_READY', status: 400 };
    }

    const amounts = InvoiceManager.splitAmountWithIva(payment.amount, {
      isrRetention: InvoiceManager.shouldApplyIsrRetention(fiscal),
    });
    if (amounts.error) {
      return { success: false, error: amounts.error, status: 400 };
    }

    const productCodes = await InvoiceManager.resolveProductCodes(
      payment.stripe_subscription_id,
      db,
      options.plannedPlan || null
    );
    const payload = InvoiceManager.buildCfdiPayload(
      fiscal,
      payment,
      amounts,
      productCodes
    );
    const stamped = await FacturamaClient.createCfdi(payload);
    if (!stamped.success) {
      return {
        success: false,
        error: 'FACTURAMA_UNAVAILABLE',
        detail: stamped.error || 'FACTURAMA_STAMP_FAILED',
        status: 503,
      };
    }

    const facturamaId = stamped.data.Id || stamped.data.id;
    const uuid =
      stamped.data?.Complement?.TaxStamp?.Uuid ||
      stamped.data?.Complement?.TaxStamp?.UUID ||
      null;
    const folio = stamped.data.Folio != null ? String(stamped.data.Folio) : null;

    if (!facturamaId) {
      return {
        success: false,
        error: 'FACTURAMA_UNAVAILABLE',
        detail: 'FACTURAMA_MISSING_ID',
        status: 503,
      };
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

    if (sendEmail && customerEmail) {
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
      pdfBuffer: pdfRes.buffer,
      xmlBuffer: xmlRes.buffer,
      folio,
      uuid,
    };
  }

  static async resolveStripeTicketPdf(stripePdfUrl, payment) {
    let url = stripePdfUrl || payment?.ticket_pdf || null;
    if (url) {
      const direct = await InvoiceManager.downloadStripeInvoicePdf(url);
      if (direct.success) return direct;
    }
    const stripeInvoiceId = payment?.stripe_invoice_id;
    if (stripeInvoiceId && String(stripeInvoiceId).startsWith('in_')) {
      try {
        const stripe = await getStripeInstance();
        const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
        url = invoice.invoice_pdf || invoice.hosted_invoice_url || null;
        if (url) {
          return InvoiceManager.downloadStripeInvoicePdf(url);
        }
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'STRIPE_PDF_UNAVAILABLE' };
  }

  static async loadCfdiBuffersFromInvoice(invoiceRow) {
    if (!invoiceRow?.pdf_storage_path || !invoiceRow?.xml_storage_path) {
      return { success: false, error: 'FILE_NOT_STORED' };
    }
    const [pdfRes, xmlRes] = await Promise.all([
      SupabaseStorageManager.download(invoiceRow.pdf_storage_path),
      SupabaseStorageManager.download(invoiceRow.xml_storage_path),
    ]);
    if (!pdfRes.success || !xmlRes.success) {
      return {
        success: false,
        error: pdfRes.error || xmlRes.error || 'CFDI_DOWNLOAD_FAILED',
      };
    }
    return {
      success: true,
      pdfBuffer: pdfRes.buffer,
      xmlBuffer: xmlRes.buffer,
      folio: invoiceRow.invoice_number || null,
      uuid: invoiceRow.facturama_uuid || null,
    };
  }

  static async storeTicketPdf(accountId, paymentHistoryId, buffer, db) {
    const ticketPath = `tickets/${accountId}/${paymentHistoryId}/ticket.pdf`;
    const upload = await SupabaseStorageManager.upload(
      ticketPath,
      buffer,
      'application/pdf'
    );
    if (!upload.success) {
      console.error('[invoice] ticket upload failed:', upload.error);
      return { success: false, error: upload.error };
    }
    try {
      await db.query(UpdatePaymentHistoryTicketStorage, [paymentHistoryId, ticketPath]);
    } catch (error) {
      console.error('[invoice] ticket_storage_path update failed:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true, path: ticketPath };
  }

  /**
   * Sube ticket a Storage, timbra CFDI si fiscal lista, envía correo con adjuntos.
   * Siempre intenta mandar al menos el ticket Stripe.
   */
  static async notifyPaymentDocuments({
    accountId,
    paymentHistoryId,
    customerEmail,
    customerName,
    stripePdfUrl,
    meta = {},
    plannedPlan = null,
    db,
  }) {
    const result = {
      stamped: false,
      emailed: false,
      skipped: false,
      ticketStored: false,
      reason: null,
      error: null,
    };

    if (!customerEmail) {
      return { ...result, skipped: true, reason: 'EMAIL_MISSING' };
    }

    const paymentLooked = await InvoiceManager.getPaymentForAccount(
      paymentHistoryId,
      accountId,
      db
    );
    if (!paymentLooked.success || !paymentLooked.payment) {
      return { ...result, skipped: true, reason: 'PAYMENT_NOT_FOUND' };
    }
    const payment = paymentLooked.payment;

    const stripePdf = await InvoiceManager.resolveStripeTicketPdf(stripePdfUrl, payment);
    let stripePdfBuffer = stripePdf.success ? stripePdf.buffer : null;
    if (stripePdfBuffer) {
      const stored = await InvoiceManager.storeTicketPdf(
        accountId,
        paymentHistoryId,
        stripePdfBuffer,
        db
      );
      if (stored.success) result.ticketStored = true;
    }

    let cfdiPdf = null;
    let cfdiXml = null;
    let folio = null;
    let uuid = null;
    let cfdiError = null;

    const fiscalLookup = await FiscalInfoManager.getByAccountId(accountId, db);
    let fiscal = fiscalLookup.fiscal;
    const canStamp =
      fiscal && fiscal.active && fiscal.authorization_accepted;

    if (canStamp) {
      if (fiscal.sat_validation_status !== 'valid') {
        const refreshed = await FiscalInfoManager.refreshSatValidation(accountId, db);
        if (refreshed.success && refreshed.fiscal) {
          fiscal = refreshed.fiscal;
        }
      }
      if (fiscal.sat_validation_status === 'valid') {
        const stamp = await InvoiceManager.createFromPayment(
          accountId,
          paymentHistoryId,
          null,
          db,
          { sendEmail: false, plannedPlan }
        );
        if (stamp.success) {
          result.stamped = true;
          if (stamp.already_exists) {
            const loaded = await InvoiceManager.loadCfdiBuffersFromInvoice(stamp.invoice);
            if (loaded.success) {
              cfdiPdf = loaded.pdfBuffer;
              cfdiXml = loaded.xmlBuffer;
              folio = loaded.folio;
              uuid = loaded.uuid;
            } else {
              cfdiError = loaded.error;
            }
          } else {
            cfdiPdf = stamp.pdfBuffer;
            cfdiXml = stamp.xmlBuffer;
            folio = stamp.folio;
            uuid = stamp.uuid;
          }
        } else {
          cfdiError = stamp.error || 'FACTURAMA_STAMP_FAILED';
          console.error('[invoice] CFDI stamp failed:', cfdiError);
        }
      } else {
        cfdiError = 'SAT_NOT_VALID';
      }
    } else {
      cfdiError = 'FISCAL_NOT_READY';
    }

    if (!stripePdfBuffer && !cfdiPdf) {
      return {
        ...result,
        skipped: true,
        reason: 'NO_DOCUMENTS',
        error: stripePdf.error || cfdiError || 'NO_ATTACHMENTS',
      };
    }

    const mail = await InvoiceManager.sendPaymentDocumentsEmail({
      email: customerEmail,
      name: customerName,
      stripePdfBuffer,
      cfdiPdf,
      cfdiXml,
      meta: {
        ...meta,
        uuid,
        folio,
        cfdi_error: cfdiError,
      },
    });
    if (!mail.success) {
      return {
        ...result,
        error: mail.error || 'PAYMENT_DOCS_EMAIL_FAILED',
      };
    }
    return { ...result, emailed: true, skipped: false };
  }

  /** @deprecated alias */
  static async tryAutoInvoiceAndEmail(opts) {
    return InvoiceManager.notifyPaymentDocuments(opts);
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
