module.exports = `
  SELECT
    ph.id,
    ph.stripe_subscription_id,
    ph.stripe_invoice_id,
    ph.status,
    ph.amount,
    ph.stripe_invoice_url,
    ph.ticket_pdf,
    ph.invoice_id,
    ph.created_at,
    ph.stripe_customer_id,
    ph.stripe_checkout_session_id,
    c.account_id,
    inv.id AS existing_invoice_id,
    inv.status AS existing_invoice_status,
    inv.pdf_storage_path AS existing_pdf_path,
    inv.xml_storage_path AS existing_xml_path,
    inv.facturama_invoice_id AS existing_facturama_id,
    inv.facturama_uuid AS existing_facturama_uuid
  FROM payment_history ph
  LEFT JOIN subscriptions s
    ON s.stripe_subscription_id = ph.stripe_subscription_id
  JOIN customers c ON (
    (s.stripe_customer_id IS NOT NULL AND c.stripe_customer_id = s.stripe_customer_id)
    OR (ph.stripe_customer_id IS NOT NULL AND c.stripe_customer_id = ph.stripe_customer_id)
  )
  LEFT JOIN invoices inv ON inv.payment_history_id = ph.id
  WHERE ph.id = $1
    AND c.account_id = $2
  LIMIT 1
`;
