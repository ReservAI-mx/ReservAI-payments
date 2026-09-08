jest.mock('../../data/StripeInstanceGetter');
jest.mock('../../utils/CustomersManager');
jest.mock('../../utils/SubscriptionManager');
jest.mock('../../utils/TechnicalInfoManager');
jest.mock('../../data/connectDB', () => ({
  connectDB: jest.fn(async () => ({})),
}));

const getStripeInstance = require('../../data/StripeInstanceGetter');
const CustomersManager = require('../../utils/CustomersManager');
const SubscriptionManager = require('../../utils/SubscriptionManager');
const TechnicalInfoManager = require('../../utils/TechnicalInfoManager');
const GetMyPaymentLinks = require('../../handlers/GetMyPaymentLinks');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('GetMyPaymentLinks', () => {
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
    CustomersManager.createPortalSession.mockResolvedValue({
      success: false,
      error: 'portal error',
    });
    SubscriptionManager.createSetupPaymentLinks.mockResolvedValue({
      success: true,
      message: 'ok',
      paymentLinks: { basico: { url: 'https://b' }, premium: { url: 'https://p' } },
    });
    const req = createMockReq();
    req.query = { subdomain: 'negocio' };
    req.customer = { stripe_customer_id: 'cus_1' };
    req.account = { id: 'acc-1', email: 'u@example.com' };
    const res = createMockRes();
    await GetMyPaymentLinks(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.paymentLinks.basico.url).toBe('https://b');
    expect(SubscriptionManager.createSetupPaymentLinks).toHaveBeenCalledWith(
      'cus_1',
      'acc-1',
      'negocio',
      null,
      null,
      expect.anything()
    );
  });
});
