module.exports = `
    SELECT cancel_at_period_end
    FROM subscriptions
    WHERE stripe_subscription_id = $1
    LIMIT 1
`;
