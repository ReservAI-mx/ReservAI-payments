jest.mock('../../utils/VaultCrypto');
jest.mock('../../utils/TechnicalInfoManager');
jest.mock('../../utils/OpsJobManager');

const VaultCrypto = require('../../utils/VaultCrypto');
const TechnicalInfoManager = require('../../utils/TechnicalInfoManager');
const OpsJobManager = require('../../utils/OpsJobManager');
const PaymentFanout = require('../../utils/PaymentFanout');

describe('PaymentFanout', () => {
  const originalUrl = process.env.PAYMENT_FANOUT_URL;
  const originalStage = process.env.STAGE;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.PAYMENT_FANOUT_URL;
    } else {
      process.env.PAYMENT_FANOUT_URL = originalUrl;
    }
    if (originalStage === undefined) {
      delete process.env.STAGE;
    } else {
      process.env.STAGE = originalStage;
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('urlFor en development apunta al KBS local', () => {
    delete process.env.PAYMENT_FANOUT_URL;
    process.env.STAGE = 'development';
    expect(PaymentFanout.urlFor('shortlink')).toBe('http://api:8000/webhooks/payment');
  });

  it('urlFor en production usa knowledge.{subdomain}', () => {
    delete process.env.PAYMENT_FANOUT_URL;
    process.env.STAGE = 'production';
    expect(PaymentFanout.urlFor('shortlink')).toBe(
      'https://knowledge.shortlink.reservai.com.mx/webhooks/payment'
    );
  });

  it('urlFor en development ignora un override a reservai.com.mx', () => {
    process.env.STAGE = 'development';
    process.env.PAYMENT_FANOUT_URL = 'https://knowledge.{subdomain}.reservai.com.mx/webhooks/payment';
    expect(PaymentFanout.urlFor('short')).toBe('http://api:8000/webhooks/payment');
  });

  it('urlFor sustituye {subdomain} en PAYMENT_FANOUT_URL', () => {
    process.env.STAGE = 'development';
    process.env.PAYMENT_FANOUT_URL = 'http://api:8000/webhooks/payment?tenant={subdomain}';
    expect(PaymentFanout.urlFor('short')).toBe(
      'http://api:8000/webhooks/payment?tenant=short'
    );
  });

  it('notifyBySubscriptionId encola y POSTea status y Bearer', async () => {
    process.env.PAYMENT_FANOUT_URL = 'http://127.0.0.1:9876/webhooks/payment';
    TechnicalInfoManager.getForFanout.mockResolvedValue({
      success: true,
      tenant: { id: 'ti-1', subdomain: 'short', inbound_auth_key: 'blob' },
    });
    OpsJobManager.enqueue.mockResolvedValue({
      success: true,
      job: { id: 'job-1' },
    });
    OpsJobManager.markSucceeded.mockResolvedValue({});
    delete process.env.PAYMENT_FANOUT_TOKEN;
    VaultCrypto.decrypt.mockReturnValue('inbound-plain');
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });

    await PaymentFanout.notifyBySubscriptionId('sub_1', 'unpaid', db);

    expect(OpsJobManager.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payment_notify',
        technical_info_id: 'ti-1',
      }),
      db
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9876/webhooks/payment',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer inbound-plain',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'unpaid' }),
      })
    );
    expect(OpsJobManager.markSucceeded).toHaveBeenCalledWith('job-1', db);
  });
});
