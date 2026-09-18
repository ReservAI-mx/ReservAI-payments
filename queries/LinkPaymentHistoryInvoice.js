module.exports = `
  UPDATE payment_history
  SET invoice_id = $2
  WHERE id = $1
  RETURNING *
`;
