module.exports = `
    UPDATE technical_info
    SET status = 'ready_for_subscription'
    WHERE id = $1 AND status = 'pending_provision'
    RETURNING id, account_id, subdomain, status, planned_plan, created_at
`;
