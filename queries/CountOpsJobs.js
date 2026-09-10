module.exports = `
  SELECT count(*)::int AS total
    FROM ops_jobs j
    LEFT JOIN technical_info t ON t.id = j.technical_info_id
    LEFT JOIN accounts a ON a.id = t.account_id
   WHERE ($1::text IS NULL OR j.status = ANY(string_to_array($1, ',')))
     AND ($2::text IS NULL OR j.action = $2)
     AND (
       $3::text IS NULL OR $3 = ''
       OR t.subdomain ILIKE '%' || $3 || '%'
       OR a.email ILIKE '%' || $3 || '%'
       OR a.name ILIKE '%' || $3 || '%'
       OR j.last_error ILIKE '%' || $3 || '%'
       OR j.id::text ILIKE '%' || $3 || '%'
     )
`;
