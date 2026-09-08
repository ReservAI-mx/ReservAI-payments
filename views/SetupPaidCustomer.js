class SetupPaidCustomerMessage {
    static getMessage(name, setupData = {}) {
        const {
            amount_total,
            amount_paid,
            currency = 'usd',
            subdomain,
            planned_plan,
        } = setupData;

        const customerName = name || 'cliente';
        const amountCents = Number.isFinite(amount_total)
            ? amount_total
            : (Number.isFinite(amount_paid) ? amount_paid : 0);
        const currencySymbol = (currency || 'usd').toUpperCase() === 'USD'
            ? '$'
            : (currency || 'usd').toUpperCase();
        const slug = subdomain || 'N/A';
        const plan = planned_plan || 'N/A';

        return {
            subject: `Confirmación de anticipo - ${slug} - ReservAI`,
            content: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #4CAF50;">¡Hola ${customerName}!</h2>
                    <p>Te confirmamos que hemos recibido el pago de anticipo de tu sucursal.</p>

                    <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                        <h3 style="margin-top: 0; color: #2e7d32;">Detalles del anticipo</h3>
                        <p><strong>Sucursal:</strong> ${slug}</p>
                        <p><strong>Plan previsto:</strong> ${plan}</p>
                        <p><strong>Monto pagado:</strong> ${currencySymbol}${(amountCents / 100).toFixed(2)}</p>
                        <p><strong>Estado:</strong> <span style="color: #4CAF50; font-weight: bold;">Pagado</span></p>
                    </div>

                    <p>Nuestro equipo continuará con la provisión. Te avisaremos cuando puedas activar la suscripción mensual.</p>

                    <p style="margin-top: 30px; color: #757575; font-size: 12px;">
                        Este es un email automático, por favor no respondas a este mensaje.
                    </p>

                    <p style="margin-top: 20px;">Saludos,<br><strong>El equipo de ReservAI</strong></p>
                </div>
            `,
            text_content: `
¡Hola ${customerName}!

Te confirmamos que hemos recibido el pago de anticipo de tu sucursal.

Detalles del anticipo:
- Sucursal: ${slug}
- Plan previsto: ${plan}
- Monto pagado: ${currencySymbol}${(amountCents / 100).toFixed(2)}
- Estado: Pagado

Nuestro equipo continuará con la provisión. Te avisaremos cuando puedas activar la suscripción mensual.

Saludos,
El equipo de ReservAI
            `,
        };
    }
}

module.exports = SetupPaidCustomerMessage;
