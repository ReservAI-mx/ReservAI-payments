module.exports = `
    SELECT id, account_id, subdomain, status, planned_plan, created_at,
           inbound_auth_key, encrypted_setup_json, pipeline_test_phone,
           hostinger_vm_id, hostinger_vm_ip, dns_apex_record_id, dns_wildcard_record_id, provision_error
    FROM technical_info
    WHERE setup_session_id = $1
    LIMIT 1
`;
