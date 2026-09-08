jest.mock('../../data/connectDB');
jest.mock('../../utils/CustomersManager');
jest.mock('../../utils/SubscriptionManager');
jest.mock('../../utils/PaymentHistoryManager');
jest.mock('../../utils/EmailContentManager');
jest.mock('../../utils/EmailManager');
jest.mock('../../utils/PaymentFailedAlertManager');
jest.mock('../../utils/SetupPaidAlertManager');
jest.mock('../../utils/TechnicalInfoManager');
jest.mock('../../utils/PaymentFanout');
jest.mock('../../utils/VaultCrypto');

const { connectDB } = require('../../data/connectDB');
const CustomersManager = require('../../utils/CustomersManager');
const SubscriptionManager = require('../../utils/SubscriptionManager');
const PaymentHistoryManager = require('../../utils/PaymentHistoryManager');
const EmailContentManager = require('../../utils/EmailContentManager');
const EmailManager = require('../../utils/EmailManager');
const PaymentFailedAlertManager = require('../../utils/PaymentFailedAlertManager');
const SetupPaidAlertManager = require('../../utils/SetupPaidAlertManager');
const TechnicalInfoManager = require('../../utils/TechnicalInfoManager');
const PaymentFanout = require('../../utils/PaymentFanout');
const VaultCrypto = require('../../utils/VaultCrypto');
const WebhooksRouter = require('../../handlers/WebhooksRouter');
const { loadStripeFixture } = require('../helpers/stripeFixtures');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

describe('WebhooksRouter', () => {
  const db = {};

  beforeEach(() => {
    connectDB.mockResolvedValue(db);
    CustomersManager.createCustomerInDB.mockResolvedValue({ success: true });
    CustomersManager.getCustomersEmailAndName.mockResolvedValue({
      success: true,
      email: 'u@example.com',
      name: 'User',
    });
    SubscriptionManager.createSubscriptionInDB.mockResolvedValue({ success: true });
    SubscriptionManager.updateSubscriptionInDB.mockResolvedValue({ success: true });
    SubscriptionManager.updateSubscriptionOnCancellation.mockResolvedValue({ success: true });
    SubscriptionManager.updateSubscriptionOnPaymentSuccess.mockResolvedValue({ success: true });
    SubscriptionManager.updateSubscriptionOnPaymentFailed.mockResolvedValue({ success: true });
    PaymentHistoryManager.createPaymentHistoryInDB.mockResolvedValue({ success: true });
    EmailContentManager.getEmailContent.mockResolvedValue({
      subject: 'Subj',
      content: '<p>Hi</p>',
      text_content: 'Hi',
    });
    EmailManager.sendEmailToCustomer.mockResolvedValue({ success: true });
    EmailContentManager.getInternalPaymentFailedContent.mockResolvedValue({
      subject: 'Pago fallido interno',
      content: '<p>Fail</p>',
      text_content: 'Fail',
    });
    EmailManager.sendEmailToInternalTeam.mockResolvedValue({ success: true });
    PaymentFailedAlertManager.notifyTeam.mockResolvedValue({ success: true });
    SetupPaidAlertManager.notifyTeam.mockResolvedValue({ success: true });
    TechnicalInfoManager.insertFromSetupSession.mockResolvedValue({ success: true, tenant: { id: 'ti-1' } });
    TechnicalInfoManager.linkSubscription.mockResolvedValue({ success: true });
    TechnicalInfoManager.setStatus.mockResolvedValue({ success: true });
    TechnicalInfoManager.setStatusBySubscriptionId.mockResolvedValue({ success: true });
    PaymentFanout.notifyBySubscriptionId.mockResolvedValue();
    VaultCrypto.encrypt.mockReturnValue('{"keyId":"v1"}');
  });

  async function runWebhook(fixtureName) {
    const event = loadStripeFixture(fixtureName);
    const req = createMockReq({ event });
    const res = createMockRes();
    await WebhooksRouter(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json).toEqual({ received: true });
    await flushAsync();
    await flushAsync();
    return { req, res };
  }

  it('customer.created persists customer without email', async () => {
    await runWebhook('customer.created');
    expect(CustomersManager.createCustomerInDB).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).not.toHaveBeenCalled();
  });

  it('customer.subscription.created creates subscription and sends email', async () => {
    await runWebhook('customer.subscription.created');
    expect(SubscriptionManager.createSubscriptionInDB).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).toHaveBeenCalled();
  });

  it('customer.subscription.updated with cancellation updates DB', async () => {
    await runWebhook('customer.subscription.updated');
    expect(SubscriptionManager.updateSubscriptionInDB).toHaveBeenCalled();
  });

  it('customer.subscription.updated.reactivate updates DB', async () => {
    await runWebhook('customer.subscription.updated.reactivate');
    expect(SubscriptionManager.updateSubscriptionInDB).toHaveBeenCalled();
  });

  it('customer.subscription.updated.noop does not update DB', async () => {
    await runWebhook('customer.subscription.updated.noop');
    expect(SubscriptionManager.updateSubscriptionInDB).not.toHaveBeenCalled();
  });

  it('customer.subscription.deleted cancels subscription', async () => {
    await runWebhook('customer.subscription.deleted');
    expect(SubscriptionManager.updateSubscriptionOnCancellation).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).toHaveBeenCalled();
  });

  it('invoice.payment_succeeded updates subscription and payment history', async () => {
    await runWebhook('invoice.payment_succeeded');
    expect(SubscriptionManager.updateSubscriptionOnPaymentSuccess).toHaveBeenCalled();
    expect(PaymentHistoryManager.createPaymentHistoryInDB).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).toHaveBeenCalled();
  });

  it('invoice.payment_failed marks unpaid, records history and alerts the team', async () => {
    await runWebhook('invoice.payment_failed');
    expect(SubscriptionManager.updateSubscriptionOnPaymentFailed).toHaveBeenCalled();
    expect(PaymentHistoryManager.createPaymentHistoryInDB).toHaveBeenCalled();
    expect(PaymentFailedAlertManager.notifyTeam).toHaveBeenCalled();
  });

  it('payment_intent.payment_failed without invoice alerts the team', async () => {
    await runWebhook('payment_intent.payment_failed');
    expect(PaymentFailedAlertManager.notifyTeam).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).not.toHaveBeenCalled();
  });

  it('payment_intent.payment_failed with invoice still notifies manager (duplicate guard lives there)', async () => {
    await runWebhook('payment_intent.payment_failed.invoice');
    expect(PaymentFailedAlertManager.notifyTeam).toHaveBeenCalled();
  });

  it('subscription created does not send internal payment-failed alert', async () => {
    await runWebhook('customer.subscription.created');
    expect(PaymentFailedAlertManager.notifyTeam).not.toHaveBeenCalled();
    expect(SetupPaidAlertManager.notifyTeam).not.toHaveBeenCalled();
  });

  it('unknown event still responds 200 immediately', async () => {
    await runWebhook('unknown.event');
    expect(SubscriptionManager.createSubscriptionInDB).not.toHaveBeenCalled();
  });

  it('DB connect failure still responds 200', async () => {
    connectDB.mockRejectedValueOnce(new Error('db down'));
    const event = loadStripeFixture('customer.created');
    const res = createMockRes();
    await WebhooksRouter(createMockReq({ event }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.received).toBe(true);
    await flushAsync();
    expect(CustomersManager.createCustomerInDB).not.toHaveBeenCalled();
  });

  it('checkout.session.completed setup inserts technical_info and emails customer + team', async () => {
    await runWebhook('checkout.session.completed');
    expect(TechnicalInfoManager.insertFromSetupSession).toHaveBeenCalled();
    expect(SetupPaidAlertManager.notifyTeam).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).toHaveBeenCalled();
    expect(PaymentHistoryManager.createPaymentHistoryInDB).not.toHaveBeenCalled();
  });

  it('checkout.session.completed setup replay (ON CONFLICT) does not alert again', async () => {
    TechnicalInfoManager.insertFromSetupSession.mockResolvedValueOnce({ success: true, tenant: null });
    await runWebhook('checkout.session.completed');
    expect(SetupPaidAlertManager.notifyTeam).not.toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).not.toHaveBeenCalled();
  });

  it('invoice.payment_succeeded with parent.subscription_details fans out ok', async () => {
    await runWebhook('invoice.payment_succeeded.parent');
    expect(TechnicalInfoManager.setStatusBySubscriptionId).toHaveBeenCalledWith(
      'sub_test123',
      'active',
      db
    );
    expect(PaymentFanout.notifyBySubscriptionId).toHaveBeenCalledWith(
      'sub_test123',
      'ok',
      db
    );
  });

  it('invoice.payment_succeeded without subscription skips payment_history', async () => {
    await runWebhook('invoice.payment_succeeded.nosub');
    expect(PaymentHistoryManager.createPaymentHistoryInDB).not.toHaveBeenCalled();
    expect(SubscriptionManager.updateSubscriptionOnPaymentSuccess).not.toHaveBeenCalled();
  });

  it('email failure still responded 200 first', async () => {
    EmailManager.sendEmailToCustomer.mockResolvedValue({ success: false, error: 'smtp' });
    const res = createMockRes();
    const event = loadStripeFixture('customer.subscription.created');
    await WebhooksRouter(createMockReq({ event }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json).toEqual({ received: true });
    await flushAsync();
    await flushAsync();
    expect(EmailManager.sendEmailToCustomer).toHaveBeenCalled();
  });
});
