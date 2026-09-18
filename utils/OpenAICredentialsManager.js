'use strict';

const OPENAI_BASE = 'https://api.openai.com/v1/organization/projects';

function adminConfig() {
    const adminKey = process.env.OPENAI_ADMIN_KEY;
    const projectId = process.env.OPENAI_PROJECT_ID;
    if (!adminKey) {
        const err = new Error('OPENAI_ADMIN_KEY missing');
        err.code = 'OPENAI_ADMIN_KEY_MISSING';
        throw err;
    }
    if (!projectId) {
        const err = new Error('OPENAI_PROJECT_ID missing');
        err.code = 'OPENAI_PROJECT_ID_MISSING';
        throw err;
    }
    return { adminKey, projectId };
}

async function openaiPost(path, body, adminKey) {
    const response = await fetch(`${OPENAI_BASE}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${adminKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        const err = new Error(`OpenAI provisioning failed (${response.status}): ${text}`);
        err.code = 'OPENAI_PROVISION_FAILED';
        throw err;
    }
    return response.json();
}

/**
 * Crea Service Account (+ key) o una key nueva si ya existe el SA.
 * @returns {{ serviceAccountId: string, apiKeyId: string, apiKey: string }}
 */
async function ensureCredentials({ subdomain, serviceAccountId = null } = {}) {
    const slug = String(subdomain || '').trim().toLowerCase();
    if (!slug) {
        const err = new Error('subdomain required for OpenAI credentials');
        err.code = 'OPENAI_SUBDOMAIN_REQUIRED';
        throw err;
    }

    const { adminKey, projectId } = adminConfig();

    if (serviceAccountId) {
        const data = await openaiPost(
            `/${projectId}/service_accounts/${serviceAccountId}/api_keys`,
            { name: `client-${slug}` },
            adminKey
        );
        const apiKey = data.value || data.api_key?.value;
        const apiKeyId = data.id || data.api_key?.id;
        if (!apiKey || !apiKeyId) {
            const err = new Error('OpenAI api_keys response missing value/id');
            err.code = 'OPENAI_PROVISION_FAILED';
            throw err;
        }
        return { serviceAccountId, apiKeyId, apiKey };
    }

    const data = await openaiPost(
        `/${projectId}/service_accounts`,
        { name: `client-${slug}` },
        adminKey
    );
    const apiKey = data.api_key?.value;
    const apiKeyId = data.api_key?.id;
    if (!data.id || !apiKey || !apiKeyId) {
        const err = new Error('OpenAI service_accounts response missing id/api_key');
        err.code = 'OPENAI_PROVISION_FAILED';
        throw err;
    }
    return { serviceAccountId: data.id, apiKeyId, apiKey };
}

module.exports = { ensureCredentials };
