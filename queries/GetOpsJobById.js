module.exports = `
  SELECT j.*,
         t.subdomain,
         t.status AS tenant_status,
         t.account_id,
         a.email AS account_email,
         a.name AS account_name
    FROM ops_jobs j
    LEFT JOIN technical_info t ON t.id = j.technical_info_id
    LEFT JOIN accounts a ON a.id = t.account_id
   WHERE j.id = $1
   LIMIT 1
`;
