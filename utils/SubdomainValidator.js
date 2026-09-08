const RESERVED = new Set([
    'www',
    'passmanager',
    'home',
    'api',
    'mail',
    'knowledge',
    'health',
    'billing',
    'app',
    'admin',
]);

function normalizeSubdomain(raw) {
    return String(raw || '').trim().toLowerCase();
}

function validateSubdomain(raw) {
    const subdomain = normalizeSubdomain(raw);
    if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(subdomain) || subdomain.includes('--')) {
        return { error: 'SUBDOMAIN_INVALID' };
    }
    if (RESERVED.has(subdomain)) {
        return { error: 'SUBDOMAIN_RESERVED' };
    }
    return { subdomain };
}

module.exports = { validateSubdomain, normalizeSubdomain, RESERVED };
