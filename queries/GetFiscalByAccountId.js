module.exports = `
  SELECT *
  FROM info_fiscal
  WHERE account_id = $1
    AND deleted_at IS NULL
  LIMIT 1
`;
