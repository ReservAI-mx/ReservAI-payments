jest.mock('../../data/connectDB');
jest.mock('../../utils/SubscriptionManager');

const { connectDB } = require('../../data/connectDB');
const SubscriptionManager = require('../../utils/SubscriptionManager');
const GetMySubscriptions = require('../../handlers/GetMySubscriptions');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('GetMySubscriptions', () => {
  it('returns paginated subscriptions list', async () => {
    connectDB.mockResolvedValue({});
    SubscriptionManager.getSubscriptionsSummaries.mockResolvedValue({
      success: true,
      subscriptions: [{ plan_name: 'Plan Premium' }],
    });
    const req = createMockReq();
    req.query = {};
    req.customer = { stripe_customer_id: 'cus_1' };
    req.account = { id: 'acc-1' };
    const res = createMockRes();
    await GetMySubscriptions(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.data).toHaveLength(1);
    expect(res._json.current_page).toBe(1);
    expect(res._json.next_page).toBeNull();
  });
});
