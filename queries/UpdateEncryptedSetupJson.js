module.exports = `
    UPDATE technical_info
       SET encrypted_setup_json = $2,
           pipeline_test_phone = COALESCE($3, pipeline_test_phone),
           provision_error = NULL
     WHERE id = $1
       AND encrypted_setup_json IS NULL
 RETURNING id, account_id, subdomain, status, planned_plan, inbound_auth_key,
           encrypted_setup_json, pipeline_test_phone, provision_error
`;
