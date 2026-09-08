jest.mock('../../data/connectDB');
jest.mock('../../utils/TechnicalInfoManager');
jest.mock('../../utils/SubscriptionManager');
jest.mock('../../utils/CustomersManager');
jest.mock('../../data/StripeInstanceGetter');

const { connectDB } = require('../../data/connectDB');
const TechnicalInfoManager = require('../../utils/TechnicalInfoManager');
const SubscriptionManager = require('../../utils/SubscriptionManager');
const CustomersManager = require('../../utils/CustomersManager');
const getStripeInstance = require('../../data/StripeInstanceGetter');
const GetMyProvision = require('../../handlers/GetMyProvision');
const ActivateSubscription = require('../../handlers/ActivateSubscription');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('GetMyProvision', () => {
  it('returns paginated setups without secrets', async () => {
    connectDB.mockResolvedValue({});
    TechnicalInfoManager.getSetupsByAccountId.mockResolvedValue({
      success: true,
      setups: [{ id: 'ti-1', subdomain: 'negocio', status: 'pending_provision' }],
    });
    const req = createMockReq();
    req.query = {};
    req.account = { id: 'acc-1' };
    const res = createMockRes();
    await GetMyProvision(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.data[0].subdomain).toBe('negocio');
  });
});

describe('ActivateSubscription', () => {
  it('returns 409 when setup is not ready_for_subscription', async () => {
    connectDB.mockResolvedValue({});
    TechnicalInfoManager.getSetupForActivate.mockResolvedValue({
      success: true,
      setup: { id: '00000000-0000-4000-8000-000000000001', status: 'pending_provision' },
    });
    const req = createMockReq();
    req.body = { technical_info_id: '00000000-0000-4000-8000-000000000001' };
    req.account = { id: 'acc-1' };
    req.customer = { stripe_customer_id: 'cus_1' };
    const res = createMockRes();
    await ActivateSubscription(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(getStripeInstance).not.toHaveBeenCalled();
  });

  it('creates checkout when ready and unlinked', async () => {
    connectDB.mockResolvedValue({});
    getStripeInstance.mockResolvedValue({});
    CustomersManager.createPortalSession.mockResolvedValue({ success: false });
    TechnicalInfoManager.getSetupForActivate.mockResolvedValue({
      success: true,
      setup: {
        id: '00000000-0000-4000-8000-000000000001',
        status: 'ready_for_subscription',
        planned_plan: 'basico',
        stripe_subscription_id: null,
      },
    });
    SubscriptionManager.createActivateCheckout.mockResolvedValue({
      success: true,
      url: 'https://checkout',
      session_id: 'cs_1',
      plan: 'basico',
    });
    const req = createMockReq();
    req.body = { technical_info_id: '00000000-0000-4000-8000-000000000001' };
    req.account = { id: 'acc-1' };
    req.customer = { stripe_customer_id: 'cus_1' };
    const res = createMockRes();
    await ActivateSubscription(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.url).toBe('https://checkout');
  });
});
