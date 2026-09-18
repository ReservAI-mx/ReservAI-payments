module.exports = `
    UPDATE technical_info
       SET encrypted_setup_json = $2,
           pipeline_test_phone = COALESCE($3, pipeline_test_phone),
           openai_service_account_id = COALESCE($4, openai_service_account_id),
           openai_api_key_id = COALESCE($5, openai_api_key_id),
           provision_error = NULL
     WHERE id = $1
       AND encrypted_setup_json IS NULL
 RETURNING id, account_id, subdomain, status, planned_plan, inbound_auth_key,
           encrypted_setup_json, pipeline_test_phone, provision_error,
           openai_service_account_id, openai_api_key_id
`;
