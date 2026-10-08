const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const MAX_MESSAGE = 2000;
const MAX_STACK = 2000;
const MAX_LOGS = 50;
const INGEST_PATH = '/api/traces';

function clip(value, max) {
    const text = value == null ? '' : String(value);
    return text.length > max ? text.slice(0, max) : text;
}

function redactText(text) {
    return String(text)
        .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
        .replace(/(password|token|secret|authorization|cookie)=\S+/gi, '$1=[REDACTED]');
}

/**
 * Primera frame útil del stack (fuera de node: / node_modules).
 * Soporta: at fn (file:line:col) y at file:line:col
 */
function parseStackFrame(stack) {
    if (!stack || typeof stack !== 'string') return null;
    const lines = stack.split('\n');
    for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('at ')) continue;
        if (line.includes('node:') || line.includes('node_modules')) continue;

        let fn = null;
        let file = null;
        let lineNo = null;

        const withFn = line.match(/^at\s+(.+?)\s+\((.+):(\d+):\d+\)$/);
        if (withFn) {
            fn = withFn[1];
            file = withFn[2];
            lineNo = Number(withFn[3]);
        } else {
            const bare = line.match(/^at\s+(.+):(\d+):\d+$/);
            if (!bare) continue;
            file = bare[1];
            lineNo = Number(bare[2]);
        }

        if (!file || file.startsWith('node:') || file.includes('node_modules')) continue;
        // Solo basename para no filtrar rutas absolutas con secretos de usuario
        const base = file.replace(/\\/g, '/').split('/').pop() || file;
        return {
            error_file: clip(base, 255),
            error_line: Number.isInteger(lineNo) && lineNo > 0 ? lineNo : null,
            error_function: fn ? clip(fn, 128) : null,
        };
    }
    return null;
}

function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
    }
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function createHmac(data, secret) {
    return `sha256=${crypto.createHmac('sha256', secret).update(data).digest('hex')}`;
}

function postJson(baseUrl, path, body, headers) {
    return new Promise((resolve, reject) => {
        const target = new URL(path, baseUrl);
        const payload = Buffer.from(body, 'utf8');
        const transport = target.protocol === 'https:' ? https : http;
        const req = transport.request(
            {
                protocol: target.protocol,
                hostname: target.hostname,
                port: target.port || (target.protocol === 'https:' ? 443 : 80),
                path: target.pathname,
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': payload.length,
                    ...headers,
                },
            },
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode || 0,
                        body: Buffer.concat(chunks).toString('utf8'),
                    });
                });
            }
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

class Log {
    constructor(message, level, service_name, event) {
        this.message = clip(redactText(message), MAX_MESSAGE);
        this.level = level;
        this.timestamp = Date.now();
        this.service_name = service_name;
        this.event = event || null;
    }
}

/**
 * Cliente que usan los otros servicios para hablar con Observability.
 * Acumula logs en memoria. Solo envía el trace si hay un error
 * (log level=error o status HTTP >= 500). Si no hay error, no manda nada.
 *
 * Env del servicio cliente:
 *   OBSERVABILITY_URL            ej. http://gateway:8080  (prod: https://passmanager.reservai.com.mx)
 *   OBSERVABILITY_HMAC_SECRET
 *   OBSERVABILITY_SERVICE_NAME   o service_name
 */
class Tracer {
    constructor(service_name, options = {}) {
        this.trace_id = crypto.randomUUID();
        this.start_time = Date.now();
        this.end_time = null;
        this.duration_ms = null;
        this.service_name = service_name
            || options.service_name
            || process.env.OBSERVABILITY_SERVICE_NAME
            || process.env.service_name
            || 'unknown';
        this.logs = [];
        this.status_code = null;
        this.http_method = null;
        this.route = null;
        this.error_name = null;
        this.stack = null;
        this.error_file = null;
        this.error_line = null;
        this.error_function = null;
        this.message = '';
        this.level = 'info';
        this.trace_status = 'pending';
        this._url = options.url || process.env.OBSERVABILITY_URL || '';
        this._secret = options.secret || process.env.OBSERVABILITY_HMAC_SECRET || '';
        this._sent = false;
    }

    static fromRequest(req, options = {}) {
        return new Tracer(undefined, options).bindHttp(req);
    }

    bindHttp(req) {
        if (!req) return this;
        this.http_method = req.method || null;
        const raw = req.originalUrl || req.url || '';
        this.route = String(raw).split('?')[0] || null;
        return this;
    }

    log(level, message, event) {
        if (this.logs.length >= MAX_LOGS) return this;
        this.logs.push(new Log(message, level, this.service_name, event));
        return this;
    }

    info(message, event) {
        return this.log('info', message, event);
    }

    warning(message, event) {
        return this.log('warning', message, event);
    }

    error(message, err, event) {
        this.log('error', message, event);
        if (err && typeof err === 'object') {
            this.error_name = err.name || 'Error';
            if (err.stack) {
                this.stack = clip(redactText(err.stack), MAX_STACK);
                const frame = parseStackFrame(err.stack);
                if (frame) {
                    this.error_file = frame.error_file;
                    this.error_line = frame.error_line;
                    this.error_function = frame.error_function;
                }
            }
        }
        return this;
    }

    hasError() {
        return this.logs.some((line) => line.level === 'error') || this.status_code >= 500;
    }

    finish(statusCode) {
        this.end_time = Date.now();
        this.duration_ms = this.end_time - this.start_time;
        if (statusCode != null) this.status_code = statusCode;
        const hasError = this.hasError();
        const hasWarning = this.logs.some((line) => line.level === 'warning');
        this.trace_status = hasError ? 'error' : 'ok';
        this.level = hasError ? 'error' : (hasWarning ? 'warning' : 'info');
        const top = this.logs.find((line) => line.level === 'error')
            || this.logs.find((line) => line.level === 'warning')
            || this.logs[this.logs.length - 1];
        this.message = top ? top.message : '';
        return this;
    }

    toJSON() {
        return {
            trace_id: this.trace_id,
            service_name: this.service_name,
            start_time: this.start_time,
            end_time: this.end_time,
            duration_ms: this.duration_ms,
            level: this.level,
            trace_status: this.trace_status,
            status_code: this.status_code,
            http_method: this.http_method,
            route: this.route,
            message: this.message,
            error_name: this.error_name,
            stack: this.stack,
            error_file: this.error_file,
            error_line: this.error_line,
            error_function: this.error_function,
            logs: this.logs.map((line) => ({
                level: line.level,
                message: line.message,
                timestamp: line.timestamp,
                event: line.event,
            })),
        };
    }

    /**
     * Cierra el trace y, solo si hay error, lo manda a Observability.
     * Un trace sin error no se envía ni se guarda en el servicio remoto.
     * Fallos de red / firma no se propagan (no rompen la request del cliente).
     */
    async flush(statusCode) {
        if (this.end_time == null) this.finish(statusCode);
        else if (statusCode != null) this.status_code = statusCode;

        if (!this.hasError()) {
            return { sent: false, reason: 'no_error' };
        }
        if (this._sent) {
            return { sent: false, reason: 'already_sent' };
        }
        if (!this._url || !this._secret) {
            return { sent: false, reason: 'misconfigured' };
        }

        const payload = this.toJSON();
        const body = canonicalJson(payload);
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signed = `POST\n${INGEST_PATH}\n${timestamp}\n${body}`;
        const signature = createHmac(signed, this._secret);

        try {
            const res = await postJson(this._url, INGEST_PATH, body, {
                'x-observability-timestamp': timestamp,
                'x-observability-signature': signature,
            });
            this._sent = res.statusCode >= 200 && res.statusCode < 300;
            return { sent: this._sent, statusCode: res.statusCode };
        } catch (err) {
            return { sent: false, reason: 'network', error: err && err.message };
        }
    }

    /**
     * Middleware Express: pone req.trace y, al terminar la respuesta,
     * solo envía si el trace tiene error (o status >= 500).
     * Un 5xx sin req.trace.error() recibe una línea error para que el ingest no rechace logs vacíos.
     */
    static middleware(options = {}) {
        return function observabilityTracer(req, res, next) {
            const tracer = Tracer.fromRequest(req, options);
            req.trace = tracer;
            res.on('finish', () => {
                if (res.statusCode >= 500 && !tracer.logs.some((line) => line.level === 'error')) {
                    tracer.error(`HTTP ${res.statusCode}`);
                }
                tracer.flush(res.statusCode).catch(() => {});
            });
            next();
        };
    }
}

module.exports = {
    Tracer,
    Log,
    canonicalJson,
    createHmac,
    parseStackFrame,
    MAX_MESSAGE,
    MAX_STACK,
    MAX_LOGS,
    INGEST_PATH,
};
