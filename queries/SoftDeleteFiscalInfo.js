module.exports = `
  UPDATE info_fiscal
  SET
    deleted_at = (now() AT TIME ZONE 'utc-6'),
    active = false,
    updated_at = (now() AT TIME ZONE 'utc-6')
  WHERE id = $1
    AND deleted_at IS NULL
  RETURNING *
`;
