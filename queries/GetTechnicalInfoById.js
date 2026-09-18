module.exports = `
    SELECT
        t.id,
        t.account_id,
        t.subdomain,
        t.status,
        t.planned_plan,
        t.created_at,
        t.inbound_auth_key,
        t.encrypted_setup_json,
        t.pipeline_test_phone,
        t.provision_error,
        t.openai_service_account_id,
        t.openai_api_key_id,
        t.hostinger_vm_id,
        t.hostinger_vm_ip,
        t.dns_apex_record_id,
        t.dns_wildcard_record_id,
        s.stripe_subscription_id
    FROM technical_info t
    LEFT JOIN subscriptions s ON s.technical_info_id = t.id
    WHERE t.id = $1
`;
