module.exports = `
    SELECT
        t.id,
        t.account_id,
        t.subdomain,
        t.status,
        t.planned_plan,
        t.created_at,
        t.inbound_auth_key,
        s.stripe_subscription_id
    FROM technical_info t
    LEFT JOIN subscriptions s ON s.technical_info_id = t.id
    WHERE t.id = $1
`;
