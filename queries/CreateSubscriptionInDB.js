module.exports = `
    INSERT INTO subscriptions (
        stripe_customer_id,
        stripe_subscription_id,
        stripe_product_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        plan_name,
        amount,
        created_at,
        technical_info_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
`;

