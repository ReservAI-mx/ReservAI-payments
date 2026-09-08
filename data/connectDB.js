const { Pool } = require('pg');
const getdbinfo = require('./getdbinfo');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;

dns.setDefaultResultOrder('ipv6first');

/** Errores de red/TLS del pooler (idle kill, Fly suspend, timeout) que no deben tumbar el proceso. */
function isTransientDbError(err) {
    if (!err) return false;
    const code = err.code || err.errno;
    const msg = String(err.message || err);
    const transientCodes = new Set([
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNREFUSED',
        'EPIPE',
        'ENOTFOUND',
        'ENETUNREACH',
        'EHOSTUNREACH',
        'EAI_AGAIN',
        '57P01',
        '57P02',
        '57P03',
    ]);
    if (transientCodes.has(code)) return true;
    return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|ENOTFOUND|Connection terminated|server closed the connection|timeout exceeded|read ETIMEDOUT|write ETIMEDOUT/i.test(msg);
}

function reportTransientDbError(err, source) {
    console.error(`⚠️  Error transitorio de DB (${source}):`, err?.code || err?.message || err);
    try {
        const Sentry = require('@sentry/node');
        Sentry.withScope((scope) => {
            scope.setLevel('warning');
            scope.setTag('error_source', 'db_network');
            scope.setTag('db_error_code', String(err?.code || 'unknown'));
            scope.setExtra('handler', source);
            Sentry.captureException(err);
        });
    } catch {
        /* Sentry opcional */
    }
}

class DatabaseConnection {
    constructor() {
        this.pool = null;
        this._rawQuery = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.reconnectCooldownMs = 60000;
        this.connectionCheckInterval = 60000;
        this.checkIntervalId = null;
        this.reconnectTimer = null;
        this.reconnectResetTimer = null;
        this.isReconnecting = false;
    }

    async verifyDNS(hostname) {
        try {
            console.log(`🔍 Verificando DNS para: ${hostname}`);
            const addresses = await dns.resolve(hostname);
            console.log(`✅ DNS resuelto:`, addresses);
            return true;
        } catch (error) {
            console.error(`❌ Error al resolver DNS:`, error.message);

            try {
                const addresses = await dns.resolve4(hostname);
                console.log(`✅ DNS IPv4 resuelto:`, addresses);
                return true;
            } catch (error4) {
                try {
                    const addresses = await dns.resolve6(hostname);
                    console.log(`✅ DNS IPv6 resuelto:`, addresses);
                    return true;
                } catch (error6) {
                    console.error(`❌ No se pudo resolver ni IPv4 ni IPv6`);
                    return false;
                }
            }
        }
    }

    async connect() {
        try {
            if (this.pool && this.isConnected) {
                console.log('✅ Conexión a la base de datos ya existe');
                return this.pool;
            }

            if (this.pool) {
                await this.safeEndPool();
            }

            console.log('🔄 Iniciando conexión a la base de datos...');

            const dbUrl = await getdbinfo();

            const urlMatch = dbUrl.match(/@([^:]+):/);
            if (urlMatch) {
                const hostname = urlMatch[1];
                const dnsOk = await this.verifyDNS(hostname);
                if (!dnsOk) {
                    throw new Error(`No se puede resolver el hostname: ${hostname}. Verifica tu conexión de red y configuración IPv6.`);
                }
            }

            const sslConfig = this.getSSLConfig();

            const config = {
                connectionString: dbUrl,
                max: 5,
                min: 0,
                idleTimeoutMillis: 20000,
                connectionTimeoutMillis: 10000,
                keepAlive: true,
                keepAliveInitialDelayMillis: 10000,
                allowExitOnIdle: true,
                ssl: sslConfig,
                application_name: 'PassManager'
            };

            this.pool = new Pool(config);
            this.attachPoolHandlers(this.pool);

            const client = await this.pool.connect();
            try {
                await client.query('SELECT NOW(), version()');
            } finally {
                client.release();
            }

            console.log('✅ Conexión a la base de datos establecida correctamente');
            this.isConnected = true;
            this.reconnectAttempts = 0;

            this.startConnectionCheck();

            return this.pool;

        } catch (error) {
            if (error.message.includes('ENOTFOUND')) {
                console.error('💡 Posibles soluciones:');
                console.error('   1. Verifica que tu instancia tenga acceso a Internet');
                console.error('   2. Usa Transaction Pooler en lugar de Direct Connection');
                console.error('   3. Verifica que IPv6 esté habilitado en Windows Server');
                console.error('   4. Revisa las reglas de seguridad de AWS (Security Groups)');
            }

            this.isConnected = false;
            await this.safeEndPool();
            throw error;
        }
    }

    attachPoolHandlers(pool) {
        this._rawQuery = pool.query.bind(pool);
        pool.query = (...args) => this.query(...args);

        pool.on('connect', (client) => {
            console.log('✅ Nueva conexión establecida a la base de datos');
            this.isConnected = true;
            this.reconnectAttempts = 0;

            client.on('error', (err) => {
                reportTransientDbError(err, 'pg_client');
                if (isTransientDbError(err)) {
                    this.isConnected = false;
                    this.scheduleReconnect();
                }
            });

            client.query('SET statement_timeout = 0').catch(() => {});
            client.query('SET idle_in_transaction_session_timeout = 0').catch(() => {});
        });

        pool.on('error', (err) => {
            reportTransientDbError(err, 'pg_pool');
            if (isTransientDbError(err)) {
                this.isConnected = false;
                this.scheduleReconnect();
            }
        });

        pool.on('remove', () => {
            console.log('⚠️  Cliente removido del pool');
        });
    }

    async safeEndPool() {
        const pool = this.pool;
        this.pool = null;
        this._rawQuery = null;
        this.isConnected = false;
        if (!pool) return;
        try {
            pool.removeAllListeners('error');
            pool.removeAllListeners('connect');
            pool.removeAllListeners('remove');
            await pool.end();
        } catch (err) {
            if (isTransientDbError(err)) {
                reportTransientDbError(err, 'pg_pool_end');
            } else {
                console.error('⚠️  Error al cerrar pool:', err?.message || err);
            }
        }
    }

    scheduleReconnect() {
        if (this.isReconnecting || this.reconnectTimer) {
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Máximo número de intentos de reconexión alcanzado');
            if (!this.reconnectResetTimer) {
                this.reconnectResetTimer = setTimeout(() => {
                    this.reconnectResetTimer = null;
                    this.reconnectAttempts = 0;
                    console.log('🔄 Reiniciando contador de reconexión tras cooldown');
                    this.scheduleReconnect();
                }, this.reconnectCooldownMs);
            }
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        console.log(`🔄 Intentando reconectar en ${delay / 1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.runReconnect().catch((err) => {
                reportTransientDbError(err, 'pg_reconnect');
                this.scheduleReconnect();
            });
        }, delay);
    }

    async runReconnect() {
        if (this.isReconnecting) return;
        this.isReconnecting = true;
        try {
            await this.safeEndPool();
            await this.connect();
        } finally {
            this.isReconnecting = false;
        }
    }

    handleReconnection() {
        this.scheduleReconnect();
    }

    startConnectionCheck() {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
        }

        this.checkIntervalId = setInterval(async () => {
            if (this.isReconnecting) return;

            if (!this.pool) {
                console.log('⚠️  Pool no existe, intentando reconectar...');
                this.isConnected = false;
                this.scheduleReconnect();
                return;
            }

            try {
                const client = await this.pool.connect();
                try {
                    await client.query('SELECT 1 as healthcheck');
                    if (!this.isConnected) {
                        console.log('✅ Conexión restaurada');
                        this.isConnected = true;
                        this.reconnectAttempts = 0;
                    }
                } finally {
                    client.release();
                }
            } catch (error) {
                this.isConnected = false;
                if (isTransientDbError(error)) {
                    reportTransientDbError(error, 'pg_healthcheck');
                }
                this.scheduleReconnect();
            }
        }, this.connectionCheckInterval);
    }

    async query(...args) {
        if (!this.pool || !this._rawQuery) {
            await this.connect();
        }

        const maxRetries = 3;
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
            try {
                if (!this._rawQuery) {
                    await this.connect();
                }
                const result = await this._rawQuery(...args);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                return result;
            } catch (error) {
                lastError = error;
                if (!isTransientDbError(error)) {
                    throw error;
                }
                this.isConnected = false;
                reportTransientDbError(error, 'pg_query');
                if (i < maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
                }
            }
        }

        this.scheduleReconnect();
        throw lastError;
    }

    async close() {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.reconnectResetTimer) {
            clearTimeout(this.reconnectResetTimer);
            this.reconnectResetTimer = null;
        }

        await this.safeEndPool();
        console.log('🔌 Conexión a la base de datos cerrada');
    }

    getSSLConfig() {
        const env = String(process.env.NODE_ENV || process.env.STAGE || '').trim().toLowerCase();
        if (env === 'development' || env === 'dev' || env === 'test') {
            console.log('🔓 SSL deshabilitado (modo development)');
            return false;
        }

        const dbSSL = String(process.env.DB_SSL ?? '').trim().toLowerCase();
        if (dbSSL === 'false' || dbSSL === '0' || dbSSL === 'off' || dbSSL === 'no') {
            console.log('🔓 SSL deshabilitado (DB_SSL=false)');
            return false;
        }

        const certsDir = path.join(__dirname, '../certs');

        let certPath = null;
        if (fs.existsSync(certsDir)) {
            const files = fs.readdirSync(certsDir);
            const certFile = files.find(file => file.endsWith('.crt'));
            if (certFile) {
                certPath = path.join(certsDir, certFile);
            }
        }

        if (certPath && fs.existsSync(certPath)) {
            try {
                const certContent = fs.readFileSync(certPath, 'utf8');
                console.log('🔐 Usando certificado SSL de Supabase:', path.basename(certPath));

                return {
                    rejectUnauthorized: true,
                    ca: certContent,
                    secureProtocol: 'TLSv1_2_method',
                    checkServerIdentity: (servername, cert) => {
                        return undefined;
                    },
                    timeout: 10000,
                    keepAlive: true
                };
            } catch (error) {
                console.error('❌ Error al leer el certificado:', error.message);
                return this.getDefaultSSLConfig();
            }
        } else {
            console.log('⚠️  Certificado SSL no encontrado, usando configuración por defecto');
            return this.getDefaultSSLConfig();
        }
    }

    getDefaultSSLConfig() {
        return {
            rejectUnauthorized: true,
            secureProtocol: 'TLSv1_2_method',
            timeout: 10000,
            keepAlive: true,
            checkServerIdentity: (servername, cert) => {
                if (!cert || !cert.subject) {
                    return new Error('Invalid certificate');
                }
                return undefined;
            }
        };
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            hasPool: !!this.pool
        };
    }
}

let dbInstance = null;
let processGuardsInstalled = false;

const connectDB = async () => {
    if (!dbInstance) {
        dbInstance = new DatabaseConnection();
    }
    installProcessGuards();

    if (!dbInstance.isConnected) {
        await dbInstance.connect();
    }

    return dbInstance.pool;
};

const getDB = async () => {
    if (!dbInstance || !dbInstance.pool) {
        console.log('🔄 No hay pool de conexiones, intentando conectar...');
        await connectDB();
    }
    return dbInstance.pool;
};

function installProcessGuards() {
    if (processGuardsInstalled || process.env.NODE_ENV === 'test') {
        return;
    }
    processGuardsInstalled = true;

    process.on('uncaughtException', (err) => {
        if (isTransientDbError(err)) {
            reportTransientDbError(err, 'uncaughtException');
            if (dbInstance) {
                dbInstance.isConnected = false;
                dbInstance.scheduleReconnect();
            }
            return;
        }
        console.error('❌ uncaughtException fatal:', err);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        if (isTransientDbError(err) || isTransientDbError(reason)) {
            reportTransientDbError(err, 'unhandledRejection');
            if (dbInstance) {
                dbInstance.isConnected = false;
                dbInstance.scheduleReconnect();
            }
            return;
        }
        console.error('❌ unhandledRejection fatal:', reason);
        process.exit(1);
    });
}

if (process.env.NODE_ENV !== 'test') {
    process.on('SIGTERM', async () => {
        console.log('🔄 SIGTERM recibido, cerrando conexiones...');
        if (dbInstance) {
            await dbInstance.close();
        }
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('🔄 SIGINT recibido, cerrando conexiones...');
        if (dbInstance) {
            await dbInstance.close();
        }
        process.exit(0);
    });
}

module.exports = {
    connectDB,
    getDB,
    getDBInstance: () => dbInstance,
    isTransientDbError,
};
