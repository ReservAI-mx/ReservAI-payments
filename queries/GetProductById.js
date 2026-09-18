module.exports = `
  SELECT *
  FROM products
  WHERE id = $1::uuid
  LIMIT 1
`;
