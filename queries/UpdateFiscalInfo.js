module.exports = `
  UPDATE info_fiscal
  SET
    rfc = $2,
    razon_social = $3,
    codigo_postal = $4,
    regimen_fiscal = $5,
    persona_moral = $6,
    uso_cfdi = $7,
    authorization_accepted = true,
    authorization_accepted_at = (now() AT TIME ZONE 'utc-6'),
    authorization_accepted_by = $8,
    authorization_accepted_ip = $9,
    authorization_terms_version = $10,
    authorization_disclaimer_text = $11,
    sat_validation_status = 'pending',
    sat_validated_at = NULL,
    sat_validation_detail = NULL,
    updated_at = (now() AT TIME ZONE 'utc-6')
  WHERE id = $1
    AND deleted_at IS NULL
  RETURNING *
`;
