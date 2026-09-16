module.exports = `
  INSERT INTO info_fiscal (
    account_id,
    active,
    rfc,
    razon_social,
    codigo_postal,
    regimen_fiscal,
    persona_moral,
    uso_cfdi,
    authorization_accepted,
    authorization_accepted_at,
    authorization_accepted_by,
    authorization_accepted_ip,
    authorization_terms_version,
    authorization_disclaimer_text,
    sat_validation_status,
    updated_at
  ) VALUES (
    $1, false, $2, $3, $4, $5, $6, $7,
    true, (now() AT TIME ZONE 'utc-6'), $8, $9, $10, $11,
    'pending',
    (now() AT TIME ZONE 'utc-6')
  )
  RETURNING *
`;
