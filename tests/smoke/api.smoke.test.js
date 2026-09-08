jest.mock('../../data/connectDB', () => ({
  connectDB: jest.fn(async () => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    close: jest.fn(),
  })),
  getDB: jest.fn(),
  getDBInstance: jest.fn(),
}));

jest.mock('../../utils/AccountManager', () => ({
  accountExistsByID: jest.fn(),
}));

jest.mock('../../utils/CustomersManager', () => ({
  customerExistByID: jest.fn(),
  createCustomerInStripe: jest.fn(),
  createPortalSession: jest.fn(),
  createCustomerInDB: jest.fn(),
  getCustomersEmailAndName: jest.fn(),
}));

jest.mock('../../utils/SubscriptionManager', () => ({
  getSubscriptionsSummaries: jest.fn(),
  createSubscriptionPaymentLinks: jest.fn(),
  createSetupPaymentLinks: jest.fn(),
  createActivateCheckout: jest.fn(),
}));

jest.mock('../../utils/TechnicalInfoManager', () => ({
  subdomainTaken: jest.fn(),
  getSetupsByAccountId: jest.fn(),
  getSetupForActivate: jest.fn(),
  listTenants: jest.fn(),
  getById: jest.fn(),
  markReady: jest.fn(),
  deletePending: jest.fn(),
  publicFields: jest.fn((row) => row),
}));

jest.mock('../../data/StripeInstanceGetter', () =>
  jest.fn(async () => ({
    customers: { create: jest.fn() },
    billingPortal: { sessions: { create: jest.fn() } },
    checkout: { sessions: { create: jest.fn() } },
    webhooks: { constructEvent: jest.fn() },
  }))
);

const request = require('supertest');
const AccountManager = require('../../utils/AccountManager');
const CustomersManager = require('../../utils/CustomersManager');
const SubscriptionManager = require('../../utils/SubscriptionManager');
const TechnicalInfoManager = require('../../utils/TechnicalInfoManager');
const getStripeInstance = require('../../data/StripeInstanceGetter');
const { accessCookie, twoFaCookie, cookieHeader } = require('../helpers/cookieAuth');
const { SQLI_PAYLOADS } = require('../helpers/securityPayloads');
const { createApp } = require('../../server');

const CSRF_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0].trim();

function applyCsrfHeaders(req, method, path) {
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    return req.set('Origin', CSRF_ORIGIN).set('Content-Type', 'application/json');
  }
  if (method === 'get' && /(^|\/)(portal|links)$/.test(path)) {
    return req.set('Content-Type', 'application/json');
  }
  return req;
}

const accountRow = {
  id: 'account-1',
  name: 'Test User',
  email: 'test@example.com',
  password: 'hash',
  createdAt: new Date(),
  started: true,
  verified: true,
  type: 'client',
  twofaenabled: false,
  salt: 'a'.repeat(64),
};

const customerRow = {
  stripe_customer_id: 'cus_test_1',
  account_id: 'account-1',
};

describe('smoke: API wiring', () => {
  let app;

  beforeAll(() => {
    app = createApp({ applyLimiter: false });
  });

  beforeEach(() => {
    AccountManager.accountExistsByID.mockResolvedValue({
      success: true,
      exists: true,
      account: { ...accountRow },
    });
    CustomersManager.customerExistByID.mockResolvedValue({
      success: true,
      exists: true,
      customer: { ...customerRow },
    });
    CustomersManager.createCustomerInStripe.mockResolvedValue({
      success: true,
      message: 'ok',
      customer: { id: 'cus_new' },
    });
    CustomersManager.createPortalSession.mockResolvedValue({
      success: true,
      session: { url: 'https://billing.stripe.com/session/test', id: 'bps_1' },
    });
    SubscriptionManager.createSubscriptionPaymentLinks.mockResolvedValue({
      success: true,
      message: 'ok',
      paymentLinks: { basico: { url: 'https://checkout/b' }, premium: { url: 'https://checkout/p' } },
    });
    SubscriptionManager.getSubscriptionsSummaries.mockResolvedValue({
      success: true,
      subscriptions: [],
    });
    SubscriptionManager.createSetupPaymentLinks.mockResolvedValue({
      success: true,
      message: 'ok',
      paymentLinks: { basico: { url: 'https://checkout/b' }, premium: { url: 'https://checkout/p' } },
    });
    TechnicalInfoManager.subdomainTaken.mockResolvedValue({ success: true, taken: false });
    TechnicalInfoManager.getSetupsByAccountId.mockResolvedValue({
      success: true,
      setups: [],
    });
    TechnicalInfoManager.listTenants.mockResolvedValue({
      success: true,
      tenants: [],
    });
    getStripeInstance.mockResolvedValue({
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus_new' }) },
      billingPortal: {
        sessions: { create: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/session/test' }) },
      },
      checkout: { sessions: { create: jest.fn() } },
      webhooks: { constructEvent: jest.fn() },
    });
  });

  test.each(['/api/health', '/api/billing/health'])('%s → 200', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  test('ruta inexistente → 404', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ruta no encontrada');
  });

  const protectedRoutes = [
    { method: 'post', path: '/api/customer' },
    { method: 'post', path: '/api/billing/customer' },
    { method: 'get', path: '/api/portal' },
    { method: 'get', path: '/api/billing/portal' },
    { method: 'get', path: '/api/links' },
    { method: 'get', path: '/api/billing/links' },
    { method: 'get', path: '/api/status' },
    { method: 'get', path: '/api/billing/status' },
    { method: 'get', path: '/api/billing/setup' },
    { method: 'post', path: '/api/billing/activate' },
    { method: 'get', path: '/api/billing/tenants' },
  ];

  test.each(protectedRoutes)('$method $path sin cookie → 418', async ({ method, path }) => {
    const res = await applyCsrfHeaders(request(app)[method](path), method, path);
    expect(res.status).toBe(418);
    expect(res.body.error).toBe('Token is required');
  });

  test.each(protectedRoutes)('$method $path con pm_two-fa → 401', async ({ method, path }) => {
    const cookies = twoFaCookie('account-1');
    const res = await applyCsrfHeaders(
      request(app)[method](path).set('Cookie', cookieHeader(cookies)),
      method,
      path
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token type');
  });

  test('GET /api/status con pm_access llega al handler', async () => {
    const res = await request(app)
      .get('/api/status')
      .set('Cookie', cookieHeader(accessCookie('account-1')));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.current_page).toBe(1);
  });

  test('GET /api/billing/portal con pm_access → 200', async () => {
    const res = await request(app)
      .get('/api/billing/portal')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookieHeader(accessCookie('account-1')));
    expect(res.status).toBe(200);
    expect(res.body.session).toBeDefined();
  });

  test('POST /api/customer con SQLi → 400 SECURITY_VIOLATION', async () => {
    const res = await request(app)
      .post('/api/customer')
      .set('Origin', CSRF_ORIGIN)
      .set('Cookie', cookieHeader(accessCookie('account-1')))
      .send({ name: SQLI_PAYLOADS.unionSelect });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SECURITY_VIOLATION');
  });

  test('GET /api/server.js → 403 FORBIDDEN_RESOURCE', async () => {
    const res = await request(app).get('/api/server.js');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_RESOURCE');
  });

  test('GET con query path traversal → 403 FORBIDDEN_RESOURCE', async () => {
    const res = await request(app).get('/api/health').query({ file: '../.env' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_RESOURCE');
  });

  test('POST /webhooks/stripe sin signature → 403 de firma, no CSRF', async () => {
    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({ id: 'evt_1' })));
    expect(res.status).toBe(403);
    expect(res.body.error).not.toBe('CSRF validation failed');
  });
});
