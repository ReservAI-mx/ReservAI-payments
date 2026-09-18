module.exports = `
    INSERT INTO technical_info (
        id,
        account_id,
        subdomain,
        status,
        planned_plan,
        inbound_auth_key,
        setup_session_id,
        environment,
        encrypted_setup_json,
        pipeline_test_phone,
        provision_error,
        openai_service_account_id,
        openai_api_key_id
    )
    VALUES ($1, $2, $3, 'pending_provision', $4, $5, $6, 'production', $7, $8, $9, $10, $11)
    ON CONFLICT (setup_session_id) DO NOTHING
    RETURNING id, account_id, subdomain, status, planned_plan, created_at, setup_session_id,
              provision_error, hostinger_vm_id, hostinger_vm_ip, dns_apex_record_id, dns_wildcard_record_id,
              environment, inbound_auth_key, encrypted_setup_json, pipeline_test_phone,
              openai_service_account_id, openai_api_key_id
`;
