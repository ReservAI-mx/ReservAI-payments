module.exports = `
  UPDATE info_fiscal
  SET
    sat_validation_status = $2,
    sat_validation_detail = $3,
    sat_validated_at = (now() AT TIME ZONE 'utc-6'),
    updated_at = (now() AT TIME ZONE 'utc-6')
  WHERE id = $1
    AND deleted_at IS NULL
  RETURNING *
`;
