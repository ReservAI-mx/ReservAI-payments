module.exports = `
  SELECT COUNT(*)::int AS count
  FROM invoices
  WHERE info_fiscal_id = $1
`;
