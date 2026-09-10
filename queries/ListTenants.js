module.exports = `
    SELECT
        t.id,
        t.account_id,
        a.name AS account_name,
        t.subdomain,
        t.status,
        t.planned_plan,
        t.created_at,
        t.provision_error,
        t.hostinger_vm_id,
        t.hostinger_vm_ip,
        t.dns_apex_record_id,
        t.dns_wildcard_record_id
    FROM technical_info t
    JOIN accounts a ON a.id = t.account_id
    WHERE ($1 = 'all' OR t.status = $1)
      AND (
        $2 = 'all'
        OR t.subdomain ILIKE '%' || $2 || '%'
        OR a.name ILIKE '%' || $2 || '%'
        OR a.email ILIKE '%' || $2 || '%'
      )
    ORDER BY t.created_at DESC
    LIMIT $3 OFFSET $4
`;
