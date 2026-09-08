module.exports = `
    INSERT INTO technical_info (
        id,
        account_id,
        subdomain,
        status,
        planned_plan,
        inbound_auth_key,
        setup_session_id
    )
    VALUES ($1, $2, $3, 'pending_provision', $4, $5, $6)
    ON CONFLICT (setup_session_id) DO NOTHING
    RETURNING id, account_id, subdomain, status, planned_plan, created_at, setup_session_id
`;
