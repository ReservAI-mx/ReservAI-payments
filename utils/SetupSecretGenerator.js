const crypto = require('crypto');

const SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|/,.<>:;?~';
const DIGITS = '0123456789';
const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const VAULT_KEYS = [
    { key: 'chatwoot_client_password', vaultSuffix: 'chatwoot_client_password', visibility: true, length: 20 },
    { key: 'chatwoot_super_admin_password', vaultSuffix: 'chatwoot_super_admin_password', visibility: false, length: 20 },
    { key: 'chatwoot_crm_admin_password', vaultSuffix: 'chatwoot_crm_admin_password', visibility: false, length: 20 },
    { key: 'minio_root_password', vaultSuffix: 'minio', visibility: false, length: 24 },
];

function randomPassword({ length = 20, requireSpecial = false } = {}) {
    const charset = requireSpecial ? ALPHANUM + SPECIAL_CHARS : ALPHANUM;
    const bytes = crypto.randomBytes(length);
    const chars = [];
    for (let i = 0; i < length; i++) chars.push(charset[bytes[i] % charset.length]);
    const required = requireSpecial ? [DIGITS, SPECIAL_CHARS] : [DIGITS];
    required.forEach((pool, i) => {
        const b = crypto.randomBytes(1)[0];
        chars[i] = pool[b % pool.length];
    });
    return chars.join('');
}

function generateVaultSecrets() {
    const secrets = {};
    for (const spec of VAULT_KEYS) {
        secrets[spec.key] = randomPassword({ length: spec.length, requireSpecial: true });
    }
    return secrets;
}

function vaultItems(subdomain, secrets) {
    const slug = String(subdomain || '').trim().toLowerCase();
    if (!slug) throw new Error('subdomain required for vault item names');
    return VAULT_KEYS.map((spec) => ({
        name: `${slug}-${spec.vaultSuffix}`,
        password: secrets[spec.key],
        visibility: spec.visibility,
        updateablebyclient: false,
    }));
}

module.exports = { generateVaultSecrets, vaultItems, randomPassword, VAULT_KEYS };
