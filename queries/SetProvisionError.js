module.exports = `
    UPDATE technical_info
       SET provision_error = $2
     WHERE id = $1
 RETURNING id, provision_error, status, encrypted_setup_json
`;
