module.exports = `
    UPDATE technical_info
       SET provision_error = NULL
     WHERE id = $1
       AND status = 'pending_provision'
       AND provision_error IS NOT NULL
 RETURNING id
`;
