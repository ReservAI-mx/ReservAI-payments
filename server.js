// Cargar variables de entorno
require('dotenv').config();
const Sentry = require('./instrument-sentry');
// Configurar zona horaria para Guadalajara, Jalisco, México
const timezone = process.env.TIMEZONE || 'America/Mexico_City';
process.env.TZ = timezone;

// Configurar zona horaria en Node.js
const { DateTime } = require('luxon');

const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { connectDB, getDB } = require('./data/connectDB');
const apiRouter = require('./router/api.router');
const webhookRouter = require('./router/webhook.router');
const VerifyStripeEvent = require('./middlewares/VerifyStripeEvent');
const SQLInjectionDetector = require('./middlewares/SQLInjectionDetector');
const VerifyProxySecret = require('./middlewares/VerifyProxySecret');
const VerifyCsrfOrigin = require('./middlewares/VerifyCsrfOrigin');
const { requestTraceMiddleware } = require('./utils/RequestTrace');
const { sentryHttp5xxCapture } = require('./middlewares/SentryHttp5xxCapture');
const { getClientIp } = require('./utils/ClientIp');

// Uso: node server.js [puerto] [environment]
// Fly: CMD node ./server.js 3001 $STAGE  →  NODE_ENV=production (cookies __Host-pm_*)
const PORT = process.argv[2] || process.env.PORT || 3000;
const ENVIRONMENT = process.argv[3] || process.env.STAGE || process.env.NODE_ENV || 'development';

if (process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = ENVIRONMENT;
}

const validEnvironments = ['development', 'production', 'staging', 'test'];
if (!validEnvironments.includes(process.env.NODE_ENV)) {
  console.warn(`⚠️  Advertencia: Environment "${process.env.NODE_ENV}" no es válido. Usando "development".`);
  process.env.NODE_ENV = 'development';
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

global.IS_PRODUCTION = IS_PRODUCTION;
process.env.IS_PRODUCTION = IS_PRODUCTION ? 'true' : 'false';

const rateLimitKey = (req) => getClientIp(req);
const rateLimitValidate = { xForwardedForHeader: false, keyGeneratorIpFallback: false };

const limiterOptions = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 70,
  message: {
    error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: rateLimitKey,
  validate: rateLimitValidate,
};

const corsOptions = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  credentials: process.env.CORS_CREDENTIALS === 'true' || true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "same-origin" }
};

/**
 * Crea la app Express sin escuchar puerto ni conectar DB.
 * Útil para tests (Supertest) y para arranque normal.
 */
function createApp(options = {}) {
  const app = express();
  const applyLimiter = options.applyLimiter !== false;

  app.use(helmet(helmetOptions));
  app.use(cors(corsOptions));
  app.set('trust proxy', 1);
  app.use(VerifyProxySecret);

  app.use('/webhooks', express.raw({ type: 'application/json' }), VerifyStripeEvent, webhookRouter);
  app.use(VerifyCsrfOrigin);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  app.use(requestTraceMiddleware);
  if (applyLimiter) {
    app.use(rateLimit(limiterOptions));
  }

  app.use(sentryHttp5xxCapture);

  app.use('/api/billing', SQLInjectionDetector.middleware(), apiRouter);
  app.use('/api', SQLInjectionDetector.middleware(), apiRouter);

  Sentry.setupExpressErrorHandler(app);

  return app;
}

const startServer = async () => {
  try {
    console.log('🔄 Iniciando conexión a la base de datos...');
    await connectDB();
    console.log('✅ Base de datos conectada exitosamente');

    const OpsJobPoller = require('./utils/OpsJobPoller');
    OpsJobPoller.start();

    const app = createApp();
    app.listen(PORT, '0.0.0.0', () => {
      const now = new Date();
      const mexicoTime = DateTime.now().setZone(timezone);

      console.log(`🚀 Servidor PassManager ejecutándose en puerto ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`🌐 Accesible desde: http://0.0.0.0:${PORT}`);
      console.log(`🌍 CORS Origin: ${process.env.CORS_ORIGIN || '*'}`);
      console.log(`⏰ Zona horaria: ${timezone}`);
      console.log(`📅 Fecha y hora UTC: ${now.toISOString()}`);
      console.log(`🕐 Hora México (Guadalajara): ${mexicoTime.toFormat('yyyy-MM-dd HH:mm:ss')} ${mexicoTime.offsetNameShort}`);
      console.log(`🔒 Modo: ${IS_PRODUCTION ? 'PRODUCCIÓN (API Keys deshabilitadas)' : 'DESARROLLO (API Keys habilitadas)'} (NODE_ENV=${process.env.NODE_ENV})`);
      console.log(`📋 Rutas disponibles:`);
      console.log(`   - GET /api/.../health (estado del servidor)`);
    });
  } catch (error) {
    console.error('❌ Error al inicializar el servidor:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();

  process.on('SIGTERM', async () => {
    console.log('🛑 Recibida señal SIGTERM, cerrando servidor...');
    try {
      const db = getDB();
      await db.close();
    } catch (error) {
      console.error('Error al cerrar la base de datos:', error.message);
    }
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('🛑 Recibida señal SIGINT, cerrando servidor...');
    try {
      const db = getDB();
      await db.close();
    } catch (error) {
      console.error('Error al cerrar la base de datos:', error.message);
    }
    process.exit(0);
  });
}

module.exports = {
  createApp,
  startServer,
  helmetOptions,
  corsOptions,
  limiterOptions,
  rateLimitKey,
};
