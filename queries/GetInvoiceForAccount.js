module.exports = `
  SELECT
    inv.*,
    c.account_id
  FROM invoices inv
  JOIN payment_history ph ON ph.id = inv.payment_history_id
  LEFT JOIN subscriptions s
    ON s.stripe_subscription_id = ph.stripe_subscription_id
  JOIN customers c ON (
    (s.stripe_customer_id IS NOT NULL AND c.stripe_customer_id = s.stripe_customer_id)
    OR (ph.stripe_customer_id IS NOT NULL AND c.stripe_customer_id = ph.stripe_customer_id)
  )
  WHERE inv.id = $1
    AND c.account_id = $2
  LIMIT 1
`;
