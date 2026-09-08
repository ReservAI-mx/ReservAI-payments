module.exports = `
    UPDATE technical_info t
    SET status = $2
    FROM subscriptions s
    WHERE s.technical_info_id = t.id
      AND s.stripe_subscription_id = $1
    RETURNING t.id, t.status, t.subdomain, t.inbound_auth_key
`;
