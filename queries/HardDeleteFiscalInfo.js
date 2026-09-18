module.exports = `
  DELETE FROM info_fiscal
  WHERE id = $1
    AND deleted_at IS NULL
  RETURNING *
`;
