module.exports = `
    INSERT INTO payment_history (
        id,
        stripe_subscription_id,
        stripe_invoice_id,
        status,
        amount,
        ticket_pdf,
        stripe_invoice_url,
        created_at,
        stripe_customer_id,
        stripe_checkout_session_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
        stripe_subscription_id = COALESCE(
            payment_history.stripe_subscription_id,
            EXCLUDED.stripe_subscription_id
        ),
        stripe_customer_id = COALESCE(
            payment_history.stripe_customer_id,
            EXCLUDED.stripe_customer_id
        ),
        stripe_checkout_session_id = COALESCE(
            payment_history.stripe_checkout_session_id,
            EXCLUDED.stripe_checkout_session_id
        ),
        ticket_pdf = COALESCE(payment_history.ticket_pdf, EXCLUDED.ticket_pdf),
        stripe_invoice_url = COALESCE(
            payment_history.stripe_invoice_url,
            EXCLUDED.stripe_invoice_url
        ),
        status = EXCLUDED.status,
        amount = COALESCE(payment_history.amount, EXCLUDED.amount)
    RETURNING *
`;
