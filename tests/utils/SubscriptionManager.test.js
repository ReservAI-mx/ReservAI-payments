const Subscription = require('../../models/subscription');
const SubscriptionManager = require('../../utils/SubscriptionManager');

describe('SubscriptionManager', () => {
  const db = { query: jest.fn() };

  beforeEach(() => {
    db.query.mockReset();
  });

  it('createSubscriptionInDB succeeds', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'row-1' }] });
    const sub = new Subscription('cus', 'sub', 'prod', 'active', new Date(), new Date(), false, 'Plan', 10, new Date());
    const result = await SubscriptionManager.createSubscriptionInDB(sub, db);
    expect(result.success).toBe(true);
    expect(db.query).toHaveBeenCalled();
  });

  it('getSubscriptionsSummaries returns rows', async () => {
    db.query.mockResolvedValue({ rows: [{ plan_name: 'Plan' }] });
    const result = await SubscriptionManager.getSubscriptionsSummaries('cus', 'acc', db);
    expect(result.success).toBe(true);
    expect(result.subscriptions).toHaveLength(1);
  });

  it('createSubscriptionPaymentLinks requires customer id', async () => {
    const stripe = { checkout: { sessions: { create: jest.fn() } } };
    const result = await SubscriptionManager.createSubscriptionPaymentLinks(null, null, null, null, null, stripe);
    expect(result.success).toBe(false);
  });

  it('createSubscriptionPaymentLinks creates two sessions', async () => {
    const stripe = {
      checkout: {
        sessions: {
          create: jest
            .fn()
            .mockResolvedValueOnce({ id: 'cs_b', url: 'https://basico' })
            .mockResolvedValueOnce({ id: 'cs_p', url: 'https://premium' }),
        },
      },
    };
    const result = await SubscriptionManager.createSubscriptionPaymentLinks(
      'cus_1',
      'acc_1',
      'e@example.com',
      'https://ok',
      'https://cancel',
      stripe
    );
    expect(result.success).toBe(true);
    expect(result.paymentLinks.basico.url).toBe('https://basico');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(2);
  });

  it('getCancelAtPeriodEnd returns flag from row', async () => {
    db.query.mockResolvedValue({ rows: [{ cancel_at_period_end: true }] });
    const result = await SubscriptionManager.getCancelAtPeriodEnd('sub_1', db);
    expect(result.success).toBe(true);
    expect(result.cancel_at_period_end).toBe(true);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['sub_1']);
  });

  it('getCancelAtPeriodEnd defaults false when missing', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const result = await SubscriptionManager.getCancelAtPeriodEnd('sub_missing', db);
    expect(result.success).toBe(true);
    expect(result.cancel_at_period_end).toBe(false);
  });
});
