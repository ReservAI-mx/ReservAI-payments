module.exports = `
    SELECT * FROM subscriptions s
    JOIN customers c ON s.stripe_customer_id = c.stripe_customer_id
    WHERE s.stripe_customer_id = $1 AND c.account_id = $2
    ORDER BY s.created_at DESC
    LIMIT $3 OFFSET $4
`;