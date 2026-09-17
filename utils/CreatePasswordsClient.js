const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const CryptoManager = require('./CryptoManager');

const PROTO_PATH = path.join(__dirname, '../proto/vault_provision.proto');
const MAX_ATTEMPTS = 8;
const DEADLINE_MS = 10_000;

const RETRY_CODES = new Set([
    grpc.status.UNAVAILABLE,
    grpc.status.DEADLINE_EXCEEDED,
]);

let VaultProvision;

function loadProto() {
    if (VaultProvision) return;
    const def = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: false,
        oneofs: true,
    });
    VaultProvision = grpc.loadPackageDefinition(def).passmanager.v1.VaultProvision;
}

function canonicalJson(request) {
    const items = (request?.items || []).map((item) => ({
        name: item.name,
        password: item.password,
        visibility: Boolean(item.visibility),
        updateablebyclient: Boolean(item.updateablebyclient),
    }));
    return JSON.stringify({
        account_id: request?.account_id,
        items,
    });
}

function sign(request, secret) {
    const ts = Math.floor(Date.now() / 1000);
    const signature = CryptoManager.createHMAC(`CREATE_PASSWORDS\n${ts}\n${canonicalJson(request)}`, secret);
    return { ts, signature };
}

function retryable(err) {
    if (!err) return false;
    if (RETRY_CODES.has(err.code)) return true;
    const msg = String(err.message || err.details || '');
    return /ECONNRESET|ECONNREFUSED|RST_STREAM/i.test(msg);
}

function sleep(ms) {
    if (process.env.NODE_ENV === 'test') return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms));
}

function target() {
    return process.env.BACKEND_GRPC_URL || 'passmanager-backend-service.flycast:50051';
}

async function unaryCreatePasswords(request) {
    const secret = process.env.GRPC_HMAC_SECRET;
    if (!secret) {
        const err = new Error('GRPC_HMAC_SECRET missing');
        err.code = grpc.status.FAILED_PRECONDITION;
        throw err;
    }
    loadProto();
    const { ts, signature } = sign(request, secret);
    const md = new grpc.Metadata();
    md.set('x-grpc-timestamp', String(ts));
    md.set('x-grpc-signature', signature);

    const client = new VaultProvision(target(), grpc.credentials.createInsecure());
    const deadline = new Date(Date.now() + DEADLINE_MS);
    try {
        return await new Promise((resolve, reject) => {
            client.CreatePasswords(request, md, { deadline }, (err, response) => {
                if (err) reject(err);
                else resolve(response);
            });
        });
    } finally {
        client.close();
    }
}

async function createPasswords(request) {
    let lastErr;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        try {
            return await unaryCreatePasswords(request);
        } catch (err) {
            lastErr = err;
            const canRetry = retryable(err) && i < MAX_ATTEMPTS - 1;
            if (!canRetry) throw err;
            await sleep(1000 * 2 ** i);
        }
    }
    throw lastErr;
}

module.exports = { createPasswords, retryable, canonicalJson };
