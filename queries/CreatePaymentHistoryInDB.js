module.exports = `
    INSERT INTO payment_history (
        id,
        stripe_subscription_id,
        stripe_invoice_id,
        status,
        amount,
        ticket_pdf,
        stripe_invoice_url,
        created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
`;
