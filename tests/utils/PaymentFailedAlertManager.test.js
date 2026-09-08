jest.mock('../../utils/EmailManager');

const EmailManager = require('../../utils/EmailManager');
const PaymentFailedAlertManager = require('../../utils/PaymentFailedAlertManager');
const { loadStripeFixture } = require('../helpers/stripeFixtures');

describe('PaymentFailedAlertManager', () => {
  beforeEach(() => {
    EmailManager.sendEmailToInternalTeam.mockResolvedValue({ success: true });
  });

  it('notifies the team for subscription invoice.payment_failed', async () => {
    const event = loadStripeFixture('invoice.payment_failed');
    expect(PaymentFailedAlertManager.shouldNotify(event)).toBe(true);
    expect(PaymentFailedAlertManager.getPaymentKind(event)).toBe('suscripción');

    const result = await PaymentFailedAlertManager.notifyTeam(event, {
      name: 'User',
      email: 'u@example.com',
    });

    expect(result.success).toBe(true);
    expect(EmailManager.sendEmailToInternalTeam).toHaveBeenCalledWith(
      expect.stringContaining('suscripción'),
      expect.stringContaining('u@example.com'),
      expect.any(String)
    );
  });

  it('classifies invoice.payment_failed without subscription as compra', () => {
    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_one_off',
          customer: 'cus_test123',
          amount_due: 49900,
          currency: 'usd',
        },
      },
    };
    expect(PaymentFailedAlertManager.getPaymentKind(event)).toBe('compra');
    expect(PaymentFailedAlertManager.shouldNotify(event)).toBe(true);
  });

  it('notifies the team for one-time payment_intent.payment_failed', async () => {
    const event = loadStripeFixture('payment_intent.payment_failed');
    expect(PaymentFailedAlertManager.shouldNotify(event)).toBe(true);
    expect(PaymentFailedAlertManager.getPaymentKind(event)).toBe('compra');

    await PaymentFailedAlertManager.notifyTeam(event, {
      name: 'User',
      email: 'u@example.com',
    });

    expect(EmailManager.sendEmailToInternalTeam).toHaveBeenCalledWith(
      expect.stringContaining('compra'),
      expect.stringContaining('Your card was declined.'),
      expect.any(String)
    );
  });

  it('skips payment_intent.payment_failed that belongs to an invoice', async () => {
    const event = loadStripeFixture('payment_intent.payment_failed.invoice');
    expect(PaymentFailedAlertManager.shouldNotify(event)).toBe(false);

    const result = await PaymentFailedAlertManager.notifyTeam(event, {
      name: 'User',
      email: 'u@example.com',
    });

    expect(result.skipped).toBe(true);
    expect(EmailManager.sendEmailToInternalTeam).not.toHaveBeenCalled();
  });

  it('does not notify for unrelated events', async () => {
    const event = loadStripeFixture('invoice.payment_succeeded');
    expect(PaymentFailedAlertManager.shouldNotify(event)).toBe(false);
    const result = await PaymentFailedAlertManager.notifyTeam(event, null);
    expect(result.skipped).toBe(true);
    expect(EmailManager.sendEmailToInternalTeam).not.toHaveBeenCalled();
  });
});
