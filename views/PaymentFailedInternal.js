class PaymentFailedInternalMessage {
    static getMessage(name, invoiceData = {}) {
        const {
            payment_kind,
            customer_email,
            stripe_customer_id,
            amount_due,
            invoice_pdf,
            hosted_invoice_url,
            period_start,
            period_end,
            number,
            next_payment_attempt,
            currency = 'usd',
            stripe_object_id,
            stripe_subscription_id,
            last_payment_error_message
        } = invoiceData;

        const kindLabel = payment_kind || 'pago';
        const customerName = name || 'Desconocido';
        const customerEmail = customer_email || 'N/A';
        const customerId = stripe_customer_id || 'N/A';
        const amountCents = Number.isFinite(amount_due) ? amount_due : 0;
        const currencySymbol = (currency || 'usd').toUpperCase() === 'USD'
            ? '$'
            : (currency || 'usd').toUpperCase();
        const periodStart = period_start
            ? new Date(period_start * 1000).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
            : null;
        const periodEnd = period_end
            ? new Date(period_end * 1000).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
            : null;
        const nextAttempt = next_payment_attempt
            ? new Date(next_payment_attempt * 1000).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
            : null;

        return {
            subject: `⚠️ Pago fallido (${kindLabel}) - ReservAI`,
            content: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #F44336;">Pago fallido en ReservAI</h2>
                    <p>Se detectó un pago fallido de <strong>${kindLabel}</strong>. El cliente también recibe un aviso cuando aplica.</p>

                    <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F44336;">
                        <h3 style="margin-top: 0; color: #c62828;">Cliente</h3>
                        <p><strong>Nombre:</strong> ${customerName}</p>
                        <p><strong>Email:</strong> ${customerEmail}</p>
                        <p><strong>Stripe customer:</strong> ${customerId}</p>
                    </div>

                    <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF9800;">
                        <h3 style="margin-top: 0; color: #e65100;">Detalles del pago</h3>
                        <p><strong>Tipo:</strong> ${kindLabel}</p>
                        <p><strong>Monto pendiente:</strong> ${currencySymbol}${(amountCents / 100).toFixed(2)}</p>
                        ${number ? `<p><strong>Referencia:</strong> ${number}</p>` : ''}
                        ${stripe_object_id ? `<p><strong>ID Stripe:</strong> ${stripe_object_id}</p>` : ''}
                        ${stripe_subscription_id ? `<p><strong>Suscripción:</strong> ${stripe_subscription_id}</p>` : ''}
                        ${periodStart && periodEnd ? `<p><strong>Período:</strong> ${periodStart} - ${periodEnd}</p>` : ''}
                        ${nextAttempt ? `<p><strong>Próximo intento:</strong> ${nextAttempt}</p>` : ''}
                        ${last_payment_error_message ? `<p><strong>Error Stripe:</strong> ${last_payment_error_message}</p>` : ''}
                    </div>

                    ${hosted_invoice_url || invoice_pdf ? `
                    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #333;">Factura</h3>
                        ${hosted_invoice_url ? `<p><a href="${hosted_invoice_url}">Ver factura en línea</a></p>` : ''}
                        ${invoice_pdf ? `<p><a href="${invoice_pdf}">Descargar PDF</a></p>` : ''}
                    </div>
                    ` : ''}

                    <p style="margin-top: 30px; color: #757575; font-size: 12px;">
                        Este es un email automático interno de ReservAI Stripe Service.
                    </p>
                </div>
            `,
            text_content: `
Pago fallido en ReservAI (${kindLabel})

Cliente:
- Nombre: ${customerName}
- Email: ${customerEmail}
- Stripe customer: ${customerId}

Detalles del pago:
- Tipo: ${kindLabel}
- Monto pendiente: ${currencySymbol}${(amountCents / 100).toFixed(2)}
${number ? `- Referencia: ${number}` : ''}
${stripe_object_id ? `- ID Stripe: ${stripe_object_id}` : ''}
${stripe_subscription_id ? `- Suscripción: ${stripe_subscription_id}` : ''}
${periodStart && periodEnd ? `- Período: ${periodStart} - ${periodEnd}` : ''}
${nextAttempt ? `- Próximo intento: ${nextAttempt}` : ''}
${last_payment_error_message ? `- Error Stripe: ${last_payment_error_message}` : ''}

${hosted_invoice_url ? `Ver factura: ${hosted_invoice_url}` : ''}
${invoice_pdf ? `PDF: ${invoice_pdf}` : ''}
            `
        };
    }
}

module.exports = PaymentFailedInternalMessage;
