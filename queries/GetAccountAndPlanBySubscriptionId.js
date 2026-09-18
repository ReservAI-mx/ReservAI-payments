module.exports = `
  SELECT
    c.account_id,
    t.planned_plan
  FROM subscriptions s
  JOIN customers c ON c.stripe_customer_id = s.stripe_customer_id
  LEFT JOIN technical_info t ON t.id = s.technical_info_id
  WHERE s.stripe_subscription_id = $1
  LIMIT 1
`;
