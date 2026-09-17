process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'test-jwt-secret-key-for-unit-tests';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.JWT_API_KEY_EXPIRES_IN = process.env.JWT_API_KEY_EXPIRES_IN || '365d';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_fake';
process.env.STRIPE_PRICE_ID_BASICO = process.env.STRIPE_PRICE_ID_BASICO || 'price_basico_test';
process.env.STRIPE_PRICE_ID_PREMIUM = process.env.STRIPE_PRICE_ID_PREMIUM || 'price_premium_test';
process.env.STRIPE_PRICE_ID_SETUP = process.env.STRIPE_PRICE_ID_SETUP || 'price_setup_test';
process.env.LIMIT_PER_PAGE = process.env.LIMIT_PER_PAGE || '6';
process.env.APIKEY_ADMIN = process.env.APIKEY_ADMIN || 'api-key-admin-test';
process.env.APIKEY_ID_ADMIN = process.env.APIKEY_ID_ADMIN || 'admin-account-id';
process.env.APIKEY_CLIENT = process.env.APIKEY_CLIENT || 'api-key-client-test';
process.env.APIKEY_ID_CLIENT = process.env.APIKEY_ID_CLIENT || 'client-account-id';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.EMAIL_USER = process.env.EMAIL_USER || 'test@example.com';
process.env.EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || 'test-password';
process.env.EMAIL_TO1 = process.env.EMAIL_TO1 || 'alerts1@example.com';
process.env.EMAIL_TO2 = process.env.EMAIL_TO2 || 'alerts2@example.com';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
process.env.CORS_CREDENTIALS = process.env.CORS_CREDENTIALS || 'true';
process.env.IS_PRODUCTION = 'false';
process.env.SENTRY_DSN = '';
process.env.SENTRY_TRACES_SAMPLE_RATE = '0';
process.env.RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || '1000';
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS || '900000';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
delete process.env.LOCAL_FANOUT_SUBSCRIPTION_ID;
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'testdb';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
process.env.BACKEND_GRPC_URL = process.env.BACKEND_GRPC_URL || 'passmanager-backend-service.flycast:50051';
process.env.GRPC_HMAC_SECRET = process.env.GRPC_HMAC_SECRET || 'test-grpc-hmac-secret';
process.env.BASE_DOMAIN = process.env.BASE_DOMAIN || 'reservai.com.mx';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-openai';
process.env.RESERVAI_SETUP_CONSTANTS = process.env.RESERVAI_SETUP_CONSTANTS || JSON.stringify({
  ssl_email: 'ops@reservai.com.mx',
  chatwoot_super_admin_email: 'admin@reservai.com.mx',
  chatwoot_crm_admin_email: 'crm@reservai.com.mx',
  admin_email: 'admin@reservai.com.mx',
  google_client_id: 'gid-test',
  google_client_secret: 'gsecret-test',
  oauth_client_secret: 'oauth-test',
  minio_root_user: 'root',
});

global.IS_PRODUCTION = false;
