const crypto = require('crypto');

function parseKeyConfig() {
    const raw = process.env.VAULT_MASTER_KEYS;
    const activeKeyId = process.env.VAULT_ACTIVE_KEY_ID;
    if (!raw || !activeKeyId) {
        return { keys: {}, activeKeyId: null };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('VAULT_MASTER_KEYS must be valid JSON');
    }
    const keys = {};
    for (const entry of parsed) {
        if (!entry.keyId || !entry.keyBase64) continue;
        keys[entry.keyId] = Buffer.from(entry.keyBase64, 'base64');
    }
    return { keys, activeKeyId };
}

class VaultCrypto {
    static getKeyConfig() {
        return parseKeyConfig();
    }

    static isCryptoJsBlob(value) {
        return typeof value === 'string' && value.startsWith('U2FsdGVk');
    }

    static isGcmBlob(value) {
        if (typeof value !== 'string' || !value.startsWith('{')) return false;
        try {
            const doc = JSON.parse(value);
            return Boolean(doc && doc.keyId && doc.iv && doc.tag && doc.ciphertext);
        } catch {
            return false;
        }
    }

    static encrypt(plaintext) {
        const { keys, activeKeyId } = this.getKeyConfig();
        if (!activeKeyId || !keys[activeKeyId]) {
            throw new Error('Vault encryption key not configured');
        }
        const key = keys[activeKeyId];
        if (key.length !== 32) {
            throw new Error('Vault encryption key must be 32 bytes');
        }

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const ciphertext = Buffer.concat([
            cipher.update(String(plaintext), 'utf8'),
            cipher.final(),
        ]);
        const tag = cipher.getAuthTag();

        return JSON.stringify({
            keyId: activeKeyId,
            iv: iv.toString('base64'),
            tag: tag.toString('base64'),
            ciphertext: ciphertext.toString('base64'),
        });
    }

    static decrypt(blob) {
        let document = blob;
        if (typeof blob === 'string') {
            try {
                document = JSON.parse(blob);
            } catch {
                throw new Error('INVALID_VAULT_BLOB');
            }
        }
        if (!document || typeof document !== 'object') {
            throw new Error('INVALID_VAULT_BLOB');
        }
        if (!document.keyId || !document.iv || !document.tag || !document.ciphertext) {
            throw new Error('INVALID_VAULT_BLOB');
        }

        const { keys } = this.getKeyConfig();
        const key = keys[document.keyId];
        if (!key) {
            throw new Error('INVALID_VAULT_BLOB');
        }

        try {
            const iv = Buffer.from(document.iv, 'base64');
            const tag = Buffer.from(document.tag, 'base64');
            const ciphertext = Buffer.from(document.ciphertext, 'base64');
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([
                decipher.update(ciphertext),
                decipher.final(),
            ]).toString('utf8');
        } catch {
            throw new Error('INVALID_VAULT_BLOB');
        }
    }
}

module.exports = VaultCrypto;
