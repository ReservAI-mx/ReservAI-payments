module.exports = `
  UPDATE payment_history
  SET ticket_storage_path = $2
  WHERE id = $1
  RETURNING *
`;
