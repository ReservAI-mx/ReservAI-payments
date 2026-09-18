const crypto = require('crypto');
const { encrypt } = require('./CreatePasswordsClient');

/** Claves de organización (= Setup/setup.shared.json). Obligatorias para generate_env.py. */
const ORG_REQUIRED_FIELDS = [
    'ssl_email',
    'chatwoot_super_admin_email',
    'chatwoot_crm_admin_email',
    'admin_email',
    'minio_root_user',
    'google_client_id',
    'google_client_secret',
    'oauth_client_secret',
    'whatsapp_app_id',
    'whatsapp_configuration_id',
    'whatsapp_app_secret',
    'whatsapp_api_version',
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_password',
    'smtp_from',
    'smtp_use_tls',
    'sentry_dsn',
];

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
    // chatwoot_client_email no es de org: se copia de client_email del tenant.
    delete parsed.chatwoot_client_email;

    const missing = ORG_REQUIRED_FIELDS.filter((key) => {
        const value = parsed[key];
        return value === undefined || value === null || String(value).trim() === '';
    });
    if (missing.length) {
        const err = new Error(`RESERVAI_SETUP_CONSTANTS incomplete: ${missing.join(', ')}`);
        err.code = 'SETUP_CONSTANTS_INCOMPLETE';
        throw err;
    }

    return { ...parsed };
}

/**
 * Plaintext del blob = setup.json completo (org + tenant).
 * VPS Bootstrap lo escribe tal cual; generate_env.py ya no necesita setup.shared.json en el VPS.
 * chatwoot_client_email = client_email (mismo contrato que generate_env._load_merged_setup).
 * openai_api_key: por tenant (OpenAICredentialsManager), no env compartido.
 */
async function buildEncryptedSetup({
    subdomain,
    client_email,
    chatwoot_client_name,
    pipeline_test_phone,
    inboundPlain,
    secrets,
    openai_api_key,
    env = 'production',
}) {
    if (!openai_api_key) {
        const err = new Error('openai_api_key required');
        err.code = 'OPENAI_API_KEY_MISSING';
        throw err;
    }
    const domain_name = `${subdomain}.${process.env.BASE_DOMAIN || 'reservai.com.mx'}`;
    const org = loadOrgConstants();
    const payload = {
        ...org,
        openai_api_key,
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
        blob: await encrypt(JSON.stringify(payload)),
    };
}

module.exports = {
    buildEncryptedSetup,
    inboundAuthTokenHash,
    loadOrgConstants,
    ORG_REQUIRED_FIELDS,
};
