const crypto = require('crypto');
const VaultCrypto = require('./VaultCrypto');

function inboundAuthTokenHash(inboundPlain) {
    return crypto.createHash('sha256').update(String(inboundPlain), 'utf8').digest('hex');
}

function loadOrgConstants() {
    const raw = process.env.RESERVAI_SETUP_CONSTANTS;
    if (!raw) {
        const err = new Error('RESERVAI_SETUP_CONSTANTS missing');
        err.code = 'SETUP_CONSTANTS_MISSING';
        throw err;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        const err = new Error('RESERVAI_SETUP_CONSTANTS invalid JSON');
        err.code = 'SETUP_CONSTANTS_INVALID';
        throw err;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        const err = new Error('RESERVAI_SETUP_CONSTANTS must be a JSON object');
        err.code = 'SETUP_CONSTANTS_INVALID';
        throw err;
    }
    const openai_api_key = process.env.OPENAI_API_KEY;
    if (!openai_api_key) {
        const err = new Error('OPENAI_API_KEY missing');
        err.code = 'OPENAI_API_KEY_MISSING';
        throw err;
    }
    return { ...parsed, openai_api_key };
}

function buildEncryptedSetup({
    subdomain,
    client_email,
    chatwoot_client_name,
    pipeline_test_phone,
    inboundPlain,
    secrets,
    env = 'production',
}) {
    const domain_name = `${subdomain}.${process.env.BASE_DOMAIN || 'reservai.com.mx'}`;
    const org = loadOrgConstants();
    const payload = {
        ...org,
        domain_name,
        client_email,
        chatwoot_client_email: client_email,
        chatwoot_client_name,
        pipeline_test_phone,
        inbound_auth_token_hash: inboundAuthTokenHash(inboundPlain),
        chatwoot_client_password: secrets.chatwoot_client_password,
        chatwoot_super_admin_password: secrets.chatwoot_super_admin_password,
        chatwoot_crm_admin_password: secrets.chatwoot_crm_admin_password,
        minio_root_password: secrets.minio_root_password,
        minio_root_user: secrets.minio_root_user || org.minio_root_user || 'root',
        env,
    };
    return {
        payload,
        blob: VaultCrypto.encrypt(JSON.stringify(payload)),
    };
}

module.exports = { buildEncryptedSetup, inboundAuthTokenHash, loadOrgConstants };
