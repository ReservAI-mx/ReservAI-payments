module.exports = `
  UPDATE products
  SET active = $2
  WHERE id = $1
  RETURNING *
`;
