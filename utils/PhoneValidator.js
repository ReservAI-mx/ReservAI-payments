const CANONICAL = /^\+521[1-9]\d{9}$/;

function normalizePipelineTestPhone(raw) {
    if (raw == null) return { ok: false };
    let s = String(raw).trim();
    if (!s) return { ok: false };
    s = s.replace(/[\s\-().]/g, '');
    if (s.startsWith('00')) s = `+${s.slice(2)}`;
    const digits = s.replace(/\D/g, '');
    let national = null;
    if (/^[1-9]\d{9}$/.test(digits)) {
        national = digits;
    } else if (digits.length === 12 && /^52[1-9]\d{9}$/.test(digits)) {
        national = digits.slice(2);
    } else if (digits.length === 13 && /^521[1-9]\d{9}$/.test(digits)) {
        national = digits.slice(3);
    } else {
        return { ok: false };
    }
    const canonical = `+521${national}`;
    if (!CANONICAL.test(canonical)) return { ok: false };
    return { ok: true, canonical };
}

module.exports = { normalizePipelineTestPhone, CANONICAL };
