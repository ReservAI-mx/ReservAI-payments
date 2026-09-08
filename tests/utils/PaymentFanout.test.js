jest.mock('../../utils/VaultCrypto');
jest.mock('../../utils/TechnicalInfoManager');

const VaultCrypto = require('../../utils/VaultCrypto');
const TechnicalInfoManager = require('../../utils/TechnicalInfoManager');
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

  it('notifyBySubscriptionId POSTea status y Bearer', async () => {
    process.env.PAYMENT_FANOUT_URL = 'http://127.0.0.1:9876/webhooks/payment';
    TechnicalInfoManager.getForFanout.mockResolvedValue({
      success: true,
      tenant: { subdomain: 'short', inbound_auth_key: 'blob' },
    });
    delete process.env.PAYMENT_FANOUT_TOKEN;
    VaultCrypto.decrypt.mockReturnValue('inbound-plain');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });

    await PaymentFanout.notifyBySubscriptionId('sub_1', 'unpaid', {});

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
  });
});
