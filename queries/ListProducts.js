module.exports = `
  SELECT *
  FROM products
  WHERE ($1::boolean IS NULL OR active = $1)
  ORDER BY created_at DESC
`;
