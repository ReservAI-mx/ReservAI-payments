module.exports = `
    DELETE FROM technical_info
    WHERE id = $1
      AND status = 'pending_provision'
      AND NOT EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.technical_info_id = technical_info.id
      )
    RETURNING id
`;
