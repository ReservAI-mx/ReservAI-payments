module.exports = `
  SELECT COUNT(*)::int AS count
  FROM payment_history ph
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
`;
