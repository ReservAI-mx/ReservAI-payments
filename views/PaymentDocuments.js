class PaymentDocumentsMessage {
  static shortError(raw) {
    if (!raw) return 'error de timbrado';
    const text = String(raw);
    // Nunca filtrar detalle operativo (sello, CSD, ExpeditionPlace, JSON Facturama).
    if (text.includes('FISCAL_NOT_READY') || text.includes('SAT_NOT_VALID')) {
      return 'perfil fiscal no listo';
    }
    if (text.includes('MONTH_EXPIRED')) return 'fuera de plazo de facturación';
    return 'error de timbrado';
  }

  static getMessage(name, meta = {}) {
    const {
      amount_paid,
      number,
      currency = 'mxn',
      uuid,
      folio,
      hosted_invoice_url,
      invoice_pdf,
      period_start,
      period_end,
    } = meta;

    const currencyCode = String(currency || 'mxn').toUpperCase();
    const amount =
      amount_paid != null
        ? `${currencyCode}${(Number(amount_paid) / 100).toFixed(2)}`
        : null;

    const periodStart = period_start
      ? new Date(period_start * 1000).toLocaleDateString('es-MX', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;
    const periodEnd = period_end
      ? new Date(period_end * 1000).toLocaleDateString('es-MX', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

    const hasTicket = meta.has_ticket !== false;
    const hasCfdi = meta.has_cfdi === true;
    const subjectSuffix = hasCfdi
      ? `ticket Stripe y factura CFDI${number ? ` (${number})` : ''}`
      : `ticket Stripe${number ? ` (${number})` : ''}`;

    const intro = hasCfdi
      ? 'Te confirmamos que recibimos tu pago. Adjuntamos el <strong>ticket de Stripe</strong> (recibo de cobro) y tu <strong>factura CFDI</strong> (PDF y XML timbrados).'
      : 'Te confirmamos que recibimos tu pago. Adjuntamos el <strong>ticket de Stripe</strong> (recibo de cobro).';

    const cfdiPendingNote = !hasCfdi
      ? `<p style="color:#856404;background:#fff8e1;padding:12px;border-radius:6px;">
          La factura CFDI no se pudo generar en este momento${meta.cfdi_error ? ` (${PaymentDocumentsMessage.shortError(meta.cfdi_error)})` : ''}.
          Conserva este ticket; podrás solicitar tu factura desde el panel cuando el servicio de timbrado esté disponible.
        </p>`
      : '';

    const attachmentItems = [];
    if (hasTicket) {
      attachmentItems.push('<li><strong>ticket-stripe-….pdf</strong> — recibo / ticket de cobro (Stripe)</li>');
    }
    if (hasCfdi) {
      attachmentItems.push('<li><strong>factura-….pdf</strong> — factura CFDI timbrada (PDF)</li>');
      attachmentItems.push('<li><strong>factura-….xml</strong> — factura CFDI timbrada (XML)</li>');
    }

    return {
      subject: `Pago recibido — ${subjectSuffix} — ReservAI`,
      content: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2e7d32;">¡Hola ${name}!</h2>
          <p>${intro}</p>
          ${cfdiPendingNote}

          <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
            <h3 style="margin-top: 0; color: #2e7d32;">Detalles del pago:</h3>
            ${amount ? `<p><strong>Monto pagado:</strong> ${amount}</p>` : ''}
            ${number ? `<p><strong>Número de factura Stripe:</strong> ${number}</p>` : ''}
            ${periodStart && periodEnd ? `<p><strong>Período:</strong> ${periodStart} - ${periodEnd}</p>` : ''}
            <p><strong>Estado:</strong> <span style="color: #4CAF50; font-weight: bold;">Pagado</span></p>
          </div>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Documentos adjuntos</h3>
            <ul>
              ${attachmentItems.join('\n              ')}
            </ul>
            ${folio ? `<p><strong>Folio CFDI:</strong> ${folio}</p>` : ''}
            ${uuid ? `<p><strong>UUID CFDI:</strong> ${uuid}</p>` : ''}
            <div style="margin: 15px 0;">
              ${
                hosted_invoice_url
                  ? `<a href="${hosted_invoice_url}" style="display: inline-block; background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 5px 5px 5px 0;">Ver invoice Stripe en línea</a>`
                  : ''
              }
              ${
                invoice_pdf
                  ? `<a href="${invoice_pdf}" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 5px 0;">Descargar PDF Stripe</a>`
                  : ''
              }
            </div>
          </div>

          <p>Gracias por tu pago.</p>
          <p style="margin-top: 30px; color: #757575; font-size: 12px;">
            Este es un email automático, por favor no respondas a este mensaje.
          </p>
          <p style="margin-top: 20px;">Saludos,<br><strong>El equipo de ReservAI</strong></p>
        </div>
      `,
      text_content: `
¡Hola ${name}!

Pago recibido. Adjuntamos:
${hasTicket ? '- Ticket Stripe (PDF)\n' : ''}${hasCfdi ? '- Factura CFDI (PDF)\n- Factura CFDI (XML)\n' : '- Factura CFDI: pendiente\n'}
${amount ? `Monto: ${amount}` : ''}
${number ? `Factura Stripe: ${number}` : ''}
${folio ? `Folio CFDI: ${folio}` : ''}
${uuid ? `UUID CFDI: ${uuid}` : ''}
${hosted_invoice_url ? `Invoice Stripe: ${hosted_invoice_url}` : ''}

Saludos,
El equipo de ReservAI
      `.trim(),
    };
  }
}

module.exports = PaymentDocumentsMessage;
