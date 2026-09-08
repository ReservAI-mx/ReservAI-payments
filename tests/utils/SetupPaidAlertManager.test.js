jest.mock('../../utils/EmailManager');

const EmailManager = require('../../utils/EmailManager');
const SetupPaidAlertManager = require('../../utils/SetupPaidAlertManager');
const { loadStripeFixture } = require('../helpers/stripeFixtures');

describe('SetupPaidAlertManager', () => {
  beforeEach(() => {
    EmailManager.sendEmailToInternalTeam.mockResolvedValue({ success: true });
  });

  it('notifies the team for checkout.session.completed kind=setup', async () => {
    const event = loadStripeFixture('checkout.session.completed');
    expect(SetupPaidAlertManager.shouldNotify(event)).toBe(true);

    const result = await SetupPaidAlertManager.notifyTeam(event, {
      name: 'User',
      email: 'u@example.com',
    });

    expect(result.success).toBe(true);
    expect(EmailManager.sendEmailToInternalTeam).toHaveBeenCalledWith(
      expect.stringContaining('negocio'),
      expect.stringContaining('u@example.com'),
      expect.any(String)
    );
  });

  it('does not notify for unrelated events', async () => {
    const event = loadStripeFixture('invoice.payment_succeeded');
    expect(SetupPaidAlertManager.shouldNotify(event)).toBe(false);
    const result = await SetupPaidAlertManager.notifyTeam(event, null);
    expect(result.skipped).toBe(true);
    expect(EmailManager.sendEmailToInternalTeam).not.toHaveBeenCalled();
  });
});
