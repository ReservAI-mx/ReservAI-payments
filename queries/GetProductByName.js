module.exports = `
  SELECT *
  FROM products
  WHERE lower(name) = lower($1)
  ORDER BY active DESC, created_at DESC
  LIMIT 1
`;
