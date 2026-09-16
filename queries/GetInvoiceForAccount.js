module.exports = `
  SELECT
    inv.*,
    c.account_id
  FROM invoices inv
  JOIN payment_history ph ON ph.id = inv.payment_history_id
  JOIN subscriptions s ON s.stripe_subscription_id = ph.stripe_subscription_id
  JOIN customers c ON c.stripe_customer_id = s.stripe_customer_id
  WHERE inv.id = $1
    AND c.account_id = $2
  LIMIT 1
`;
