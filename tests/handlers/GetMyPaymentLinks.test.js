jest.mock('../../data/StripeInstanceGetter');
jest.mock('../../utils/CustomersManager');
jest.mock('../../utils/SubscriptionManager');
jest.mock('../../utils/TechnicalInfoManager');
jest.mock('../../utils/ProductsManager');
jest.mock('../../utils/FiscalInfoManager');
jest.mock('../../data/connectDB', () => ({
  connectDB: jest.fn(async () => ({})),
}));

const getStripeInstance = require('../../data/StripeInstanceGetter');
const CustomersManager = require('../../utils/CustomersManager');
const SubscriptionManager = require('../../utils/SubscriptionManager');
const TechnicalInfoManager = require('../../utils/TechnicalInfoManager');
const ProductsManager = require('../../utils/ProductsManager');
const FiscalInfoManager = require('../../utils/FiscalInfoManager');
const GetMyPaymentLinks = require('../../handlers/GetMyPaymentLinks');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('GetMyPaymentLinks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid subdomain before Stripe', async () => {
    const req = createMockReq();
    req.query = { subdomain: 'WWW' };
    req.customer = { stripe_customer_id: 'cus_1' };
    req.account = { id: 'acc-1', email: 'u@example.com' };
    const res = createMockRes();
    await GetMyPaymentLinks(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res._json.error).toBe('SUBDOMAIN_RESERVED');
    expect(getStripeInstance).not.toHaveBeenCalled();
  });

  it('continues when portal fails and still returns payment links', async () => {
    getStripeInstance.mockResolvedValue({});
    TechnicalInfoManager.subdomainTaken.mockResolvedValue({ success: true, taken: false });
    ProductsManager.list.mockResolvedValue({
      success: true,
      products: [{ id: 'p1', name: 'Básico', stripe_price_id_setup: 'price_s' }],
    });
    FiscalInfoManager.resolvePriceVariant.mockResolvedValue({
      success: true,
      variant: 'full',
      flags: {
        fiscal_registered: false,
        fiscal_active: false,
        sat_validation_status: null,
        persona_moral: false,
      },
    });
    CustomersManager.createPortalSession.mockResolvedValue({
      success: false,
      error: 'portal error',
    });
    SubscriptionManager.createSetupPaymentLinks.mockResolvedValue({
      success: true,
      message: 'ok',
      paymentLinks: [{ id: 'p1', name: 'Básico', url: 'https://b' }],
      price_variant: 'full',
      fiscal: { persona_moral: false },
    });
    const req = createMockReq();
    req.query = { subdomain: 'negocio' };
    req.customer = { stripe_customer_id: 'cus_1' };
    req.account = { id: 'acc-1', email: 'u@example.com' };
    const res = createMockRes();
    await GetMyPaymentLinks(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.paymentLinks[0].url).toBe('https://b');
    expect(SubscriptionManager.createSetupPaymentLinks).toHaveBeenCalledWith(
      'cus_1',
      'acc-1',
      'negocio',
      null,
      null,
      expect.anything(),
      expect.any(Array),
      expect.objectContaining({ variant: 'full' })
    );
  });

  it('returns 503 when no active products', async () => {
    TechnicalInfoManager.subdomainTaken.mockResolvedValue({ success: true, taken: false });
    ProductsManager.list.mockResolvedValue({ success: true, products: [] });
    const req = createMockReq();
    req.query = { subdomain: 'negocio' };
    req.customer = { stripe_customer_id: 'cus_1' };
    req.account = { id: 'acc-1' };
    const res = createMockRes();
    await GetMyPaymentLinks(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res._json.error).toBe('NO_ACTIVE_PRODUCTS');
    expect(getStripeInstance).not.toHaveBeenCalled();
  });
});
