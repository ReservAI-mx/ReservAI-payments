module.exports = `
    SELECT t.subdomain, t.inbound_auth_key
    FROM technical_info t
    JOIN subscriptions s ON s.technical_info_id = t.id
    WHERE s.stripe_subscription_id = $1
    LIMIT 1
`;
