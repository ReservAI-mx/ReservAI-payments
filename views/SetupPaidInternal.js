class SetupPaidInternalMessage {
    static getMessage(name, setupData = {}) {
        const {
            customer_email,
            stripe_customer_id,
            amount_total,
            currency = 'usd',
            subdomain,
            planned_plan,
            account_id,
            setup_session_id,
        } = setupData;

        const customerName = name || 'Desconocido';
        const customerEmail = customer_email || 'N/A';
        const customerId = stripe_customer_id || 'N/A';
        const amountCents = Number.isFinite(amount_total) ? amount_total : 0;
        const currencySymbol = (currency || 'usd').toUpperCase() === 'USD'
            ? '$'
            : (currency || 'usd').toUpperCase();
        const slug = subdomain || 'N/A';
        const plan = planned_plan || 'N/A';

        return {
            subject: `Anticipo pagado (${slug}) - ReservAI`,
            content: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2e7d32;">Anticipo pagado en ReservAI</h2>
                    <p>Se pagó el anticipo de alta. La sucursal queda en <strong>pending_provision</strong> hasta que ops la marque lista.</p>

                    <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                        <h3 style="margin-top: 0; color: #2e7d32;">Cliente</h3>
                        <p><strong>Nombre:</strong> ${customerName}</p>
                        <p><strong>Email:</strong> ${customerEmail}</p>
                        <p><strong>Stripe customer:</strong> ${customerId}</p>
                        ${account_id ? `<p><strong>Account:</strong> ${account_id}</p>` : ''}
                    </div>

                    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;">
                        <h3 style="margin-top: 0; color: #1565c0;">Sucursal</h3>
                        <p><strong>Slug:</strong> ${slug}</p>
                        <p><strong>Plan previsto:</strong> ${plan}</p>
                        <p><strong>Monto:</strong> ${currencySymbol}${(amountCents / 100).toFixed(2)}</p>
                        ${setup_session_id ? `<p><strong>Checkout:</strong> ${setup_session_id}</p>` : ''}
                    </div>

                    <p style="margin-top: 30px; color: #757575; font-size: 12px;">
                        Este es un email automático interno de ReservAI Stripe Service.
                    </p>
                </div>
            `,
            text_content: `
Anticipo pagado en ReservAI

Cliente:
- Nombre: ${customerName}
- Email: ${customerEmail}
- Stripe customer: ${customerId}
${account_id ? `- Account: ${account_id}` : ''}

Sucursal:
- Slug: ${slug}
- Plan previsto: ${plan}
- Monto: ${currencySymbol}${(amountCents / 100).toFixed(2)}
${setup_session_id ? `- Checkout: ${setup_session_id}` : ''}
            `,
        };
    }
}

module.exports = SetupPaidInternalMessage;
