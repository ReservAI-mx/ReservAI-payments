module.exports = `
    UPDATE subscriptions
    SET technical_info_id = $1
    WHERE stripe_subscription_id = $2
      AND technical_info_id IS NULL
    RETURNING stripe_subscription_id, technical_info_id
`;
