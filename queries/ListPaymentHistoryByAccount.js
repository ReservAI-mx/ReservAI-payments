module.exports = `
  SELECT
    ph.id,
    ph.created_at,
    ph.amount,
    ph.status,
    ph.stripe_invoice_id,
    ph.stripe_checkout_session_id,
    ph.ticket_pdf,
    ph.ticket_storage_path,
    ph.invoice_id,
    inv.invoice_number,
    inv.facturama_uuid,
    inv.pdf_storage_path,
    inv.xml_storage_path
  FROM payment_history ph
  LEFT JOIN invoices inv
    ON inv.payment_history_id = ph.id
  WHERE (
    ph.stripe_customer_id IN (
      SELECT c.stripe_customer_id
      FROM customers c
      WHERE c.account_id = $1
        AND c.stripe_customer_id IS NOT NULL
    )
    OR ph.stripe_subscription_id IN (
      SELECT s.stripe_subscription_id
      FROM subscriptions s
      JOIN customers c ON c.stripe_customer_id = s.stripe_customer_id
      WHERE c.account_id = $1
        AND s.stripe_subscription_id IS NOT NULL
    )
  )
  ORDER BY ph.created_at DESC
  LIMIT $2 OFFSET $3
`;
