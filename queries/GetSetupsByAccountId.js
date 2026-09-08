module.exports = `
    SELECT id, subdomain, status, planned_plan, created_at
    FROM technical_info
    WHERE account_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
`;
