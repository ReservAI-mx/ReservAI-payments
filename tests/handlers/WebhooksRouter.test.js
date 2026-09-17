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
jest.mock('../../utils/ProvisionFanout');
jest.mock('../../utils/InvoiceManager');
jest.mock('../../data/StripeInstanceGetter');
jest.mock('../../utils/CreatePasswordsClient', () => ({
  createPasswords: jest.fn(async () => ({ ok: true, created: 4, skipped: 0 })),
  encrypt: jest.fn(async () => '{"keyId":"v1"}'),
  decrypt: jest.fn(async () => 'inbound-plain'),
}));
jest.mock('../../utils/captureOpsError', () => ({
  captureOpsError: jest.fn((e) => (e instanceof Error ? e : new Error(String(e)))),
  captureStripeFailure: jest.fn((e) => (e instanceof Error ? e : new Error(String(e)))),
  flushSentry: jest.fn(async () => {}),
}));

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
const ProvisionFanout = require('../../utils/ProvisionFanout');
const InvoiceManager = require('../../utils/InvoiceManager');
const getStripeInstance = require('../../data/StripeInstanceGetter');
const CreatePasswordsClient = require('../../utils/CreatePasswordsClient');
const { captureStripeFailure, flushSentry } = require('../../utils/captureOpsError');
const WebhooksRouter = require('../../handlers/WebhooksRouter');
const { loadStripeFixture } = require('../helpers/stripeFixtures');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

describe('WebhooksRouter', () => {
  const db = {};

  beforeEach(() => {
    connectDB.mockResolvedValue(db);
    captureStripeFailure.mockClear();
    flushSentry.mockClear();
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
    SubscriptionManager.getCancelAtPeriodEnd.mockResolvedValue({
      success: true,
      cancel_at_period_end: false,
    });
    PaymentHistoryManager.createPaymentHistoryInDB.mockResolvedValue({
      success: true,
      payment: { id: 'ph-1' },
    });
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
    TechnicalInfoManager.insertFromSetupSession.mockImplementation(async (row) => ({
      success: true,
      tenant: {
        id: row.id || 'ti-1',
        status: 'pending_provision',
        provision_error: row.provision_error || null,
        encrypted_setup_json: row.encrypted_setup_json || null,
        pipeline_test_phone: row.pipeline_test_phone || null,
        subdomain: row.subdomain,
        account_id: row.account_id,
        inbound_auth_key: row.inbound_auth_key,
      },
    }));
    TechnicalInfoManager.linkSubscription.mockResolvedValue({ success: true });
    TechnicalInfoManager.setStatus.mockResolvedValue({ success: true });
    TechnicalInfoManager.setStatusBySubscriptionId.mockResolvedValue({ success: true });
    TechnicalInfoManager.setProvisionError.mockResolvedValue({ success: true });
    TechnicalInfoManager.updateEncryptedSetup.mockResolvedValue({ success: true, tenant: null });
    TechnicalInfoManager.getForFanout.mockResolvedValue({ success: true, tenant: { id: 'ti-1', subdomain: 'acme' } });
    TechnicalInfoManager.getBySetupSessionId.mockResolvedValue({ success: true, tenant: null });
    PaymentFanout.notifyBySubscriptionId.mockResolvedValue();
    ProvisionFanout.notify.mockResolvedValue({ success: true });
    CreatePasswordsClient.encrypt.mockResolvedValue('{"keyId":"v1"}');
    CreatePasswordsClient.decrypt.mockResolvedValue('inbound-plain');

    InvoiceManager.getAccountAndPlanBySubscriptionId.mockResolvedValue({
      success: true,
      row: { account_id: 'acc-1', planned_plan: 'Pro' },
    });
    InvoiceManager.notifyPaymentDocuments.mockResolvedValue({
      stamped: false,
      emailed: false,
      skipped: true,
      reason: 'FISCAL_NOT_READY',
    });
    getStripeInstance.mockResolvedValue({
      invoices: { retrieve: jest.fn().mockResolvedValue({}) },
    });
    CreatePasswordsClient.createPasswords.mockResolvedValue({ ok: true, created: 4, skipped: 0 });
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
    expect(InvoiceManager.notifyPaymentDocuments).toHaveBeenCalled();
    expect(ProvisionFanout.notify).toHaveBeenCalledWith('ti-1', 'enable_renewal', db);
  });

  it('invoice.payment_succeeded stamps CFDI and skips generic email when emailed', async () => {
    InvoiceManager.notifyPaymentDocuments.mockResolvedValue({
      stamped: true,
      emailed: true,
      skipped: false,
    });

    await runWebhook('invoice.payment_succeeded');

    expect(InvoiceManager.notifyPaymentDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        paymentHistoryId: 'ph-1',
        customerEmail: 'u@example.com',
      })
    );
    expect(EmailManager.sendEmailToCustomer).not.toHaveBeenCalled();
  });

  it('invoice.payment_succeeded keeps history when Facturama stamp fails', async () => {
    InvoiceManager.notifyPaymentDocuments.mockResolvedValue({
      stamped: false,
      emailed: false,
      skipped: false,
      error: 'FACTURAMA_STAMP_FAILED',
    });

    await runWebhook('invoice.payment_succeeded');

    expect(PaymentHistoryManager.createPaymentHistoryInDB).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).toHaveBeenCalled();
    expect(captureStripeFailure).toHaveBeenCalled();
  });

  it('invoice.payment_failed marks unpaid, records history and alerts the team', async () => {
    await runWebhook('invoice.payment_failed');
    expect(SubscriptionManager.updateSubscriptionOnPaymentFailed).toHaveBeenCalled();
    expect(PaymentHistoryManager.createPaymentHistoryInDB).toHaveBeenCalled();
    expect(PaymentFailedAlertManager.notifyTeam).toHaveBeenCalled();
    expect(ProvisionFanout.notify).toHaveBeenCalledWith('ti-1', 'disable_renewal', db);
  });

  it('invoice.payment_succeeded skips enable_renewal when cancel_at_period_end', async () => {
    SubscriptionManager.getCancelAtPeriodEnd.mockResolvedValueOnce({
      success: true,
      cancel_at_period_end: true,
    });
    await runWebhook('invoice.payment_succeeded');
    expect(PaymentFanout.notifyBySubscriptionId).toHaveBeenCalledWith(
      expect.any(String),
      'ok',
      db
    );
    expect(ProvisionFanout.notify).not.toHaveBeenCalledWith('ti-1', 'enable_renewal');
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
    expect(ProvisionFanout.notify).toHaveBeenCalledWith(
      expect.any(String),
      'provision',
      db
    );
    expect(SetupPaidAlertManager.notifyTeam).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).toHaveBeenCalled();
    expect(PaymentHistoryManager.createPaymentHistoryInDB).toHaveBeenCalled();
    expect(InvoiceManager.notifyPaymentDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: '00000000-0000-4000-8000-000000000001',
        plannedPlan: 'basico',
      })
    );
    expect(flushSentry).toHaveBeenCalled();
  });

  it('checkout.session.completed setup with fiscal ready sends CFDI docs and skips setup email', async () => {
    TechnicalInfoManager.insertFromSetupSession.mockResolvedValueOnce({
      success: true,
      tenant: { id: 'ti-1', status: 'pending_provision', provision_error: null },
    });
    InvoiceManager.notifyPaymentDocuments.mockResolvedValue({
      stamped: true,
      emailed: true,
      skipped: false,
    });
    await runWebhook('checkout.session.completed');
    expect(PaymentHistoryManager.createPaymentHistoryInDB).toHaveBeenCalled();
    expect(InvoiceManager.notifyPaymentDocuments).toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).not.toHaveBeenCalled();
    expect(SetupPaidAlertManager.notifyTeam).toHaveBeenCalled();
  });

  it('checkout insert soft-failure reports to Sentry', async () => {
    TechnicalInfoManager.insertFromSetupSession.mockResolvedValueOnce({
      success: false,
      error: 'null value in column "environment" of relation "technical_info" violates not-null constraint',
    });
    TechnicalInfoManager.getBySetupSessionId.mockResolvedValueOnce({ success: true, tenant: null });
    await runWebhook('checkout.session.completed');
    expect(captureStripeFailure).toHaveBeenCalledWith(
      expect.stringContaining('environment'),
      expect.objectContaining({
        area: 'webhook',
        phase: 'webhook.checkout.insert',
        event_type: 'checkout.session.completed',
      })
    );
    expect(SetupPaidAlertManager.notifyTeam).not.toHaveBeenCalled();
    expect(flushSentry).toHaveBeenCalled();
  });

  it('checkout.session.completed setup replay (ON CONFLICT) does not alert again', async () => {
    TechnicalInfoManager.getBySetupSessionId.mockResolvedValueOnce({
      success: true,
      tenant: {
        id: 'ti-1',
        status: 'pending_provision',
        provision_error: 'dns_apex: x',
        encrypted_setup_json: '{"keyId":"v1"}',
      },
    });
    PaymentHistoryManager.createPaymentHistoryInDB.mockResolvedValueOnce({
      success: false,
      error: 'duplicate key value violates unique constraint',
    });
    await runWebhook('checkout.session.completed');
    expect(SetupPaidAlertManager.notifyTeam).not.toHaveBeenCalled();
    expect(EmailManager.sendEmailToCustomer).not.toHaveBeenCalled();
    expect(ProvisionFanout.notify).not.toHaveBeenCalled();
    expect(PaymentHistoryManager.createPaymentHistoryInDB).toHaveBeenCalled();
    expect(InvoiceManager.notifyPaymentDocuments).not.toHaveBeenCalled();
    expect(CreatePasswordsClient.createPasswords).not.toHaveBeenCalled();
  });

  it('customer.subscription.updated with cancellation disables renewal', async () => {
    await runWebhook('customer.subscription.updated');
    expect(SubscriptionManager.updateSubscriptionInDB).toHaveBeenCalled();
    expect(ProvisionFanout.notify).toHaveBeenCalledWith('ti-1', 'disable_renewal', db);
  });

  it('customer.subscription.updated.reactivate enables renewal', async () => {
    await runWebhook('customer.subscription.updated.reactivate');
    expect(SubscriptionManager.updateSubscriptionInDB).toHaveBeenCalled();
    expect(ProvisionFanout.notify).toHaveBeenCalledWith('ti-1', 'enable_renewal', db);
  });

  it('customer.subscription.deleted also disables hostinger renewal', async () => {
    await runWebhook('customer.subscription.deleted');
    expect(ProvisionFanout.notify).toHaveBeenCalledWith('ti-1', 'disable_renewal', db);
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
    expect(ProvisionFanout.notify).toHaveBeenCalledWith('ti-1', 'enable_renewal', db);
  });

  it('invoice.payment_succeeded without subscription skips payment_history', async () => {
    await runWebhook('invoice.payment_succeeded.nosub');
    expect(PaymentHistoryManager.createPaymentHistoryInDB).not.toHaveBeenCalled();
    expect(SubscriptionManager.updateSubscriptionOnPaymentSuccess).not.toHaveBeenCalled();
    expect(ProvisionFanout.notify).not.toHaveBeenCalled();
  });

  function cloneSetupEvent(phone) {
    const event = loadStripeFixture('checkout.session.completed');
    event.data.object.metadata = { ...event.data.object.metadata };
    if (phone === undefined) delete event.data.object.metadata.pipeline_test_phone;
    else event.data.object.metadata.pipeline_test_phone = phone;
    return event;
  }

  async function runSetupEvent(event) {
    const req = createMockReq({ event });
    const res = createMockRes();
    await WebhooksRouter(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    await flushAsync();
    await flushAsync();
    return { req, res };
  }

  function grpcItems() {
    expect(CreatePasswordsClient.createPasswords).toHaveBeenCalled();
    const args = CreatePasswordsClient.createPasswords.mock.calls[0];
    const req = args[0];
    if (Array.isArray(req)) return req;
    if (req && (req.items || req.entries)) return req.items || req.entries;
    if (Array.isArray(args[1])) return args[1];
    return [];
  }

  it('checkout setup con teléfono canónico inserta blob y luego fanout', async () => {
    const order = [];
    TechnicalInfoManager.insertFromSetupSession.mockImplementation(async (row) => {
      order.push('insert');
      expect(row.encrypted_setup_json).toBeTruthy();
      expect(row.pipeline_test_phone).toBe('+5213321540248');
      return {
        success: true,
        tenant: {
          id: row.id,
          status: 'pending_provision',
          provision_error: null,
          encrypted_setup_json: row.encrypted_setup_json,
        },
      };
    });
    ProvisionFanout.notify.mockImplementation(async () => {
      order.push('notify');
      return { success: true };
    });
    await runSetupEvent(cloneSetupEvent('+5213321540248'));
    expect(order).toEqual(['insert', 'notify']);
    expect(TechnicalInfoManager.insertFromSetupSession.mock.invocationCallOrder[0])
      .toBeLessThan(ProvisionFanout.notify.mock.invocationCallOrder[0]);
  });

  it('checkout setup con teléfono crudo re-normaliza a canónico antes de persistir', async () => {
    TechnicalInfoManager.insertFromSetupSession.mockImplementation(async (row) => {
      expect(row.pipeline_test_phone).toBe('+5213321540248');
      return {
        success: true,
        tenant: {
          id: row.id,
          status: 'pending_provision',
          provision_error: null,
          encrypted_setup_json: row.encrypted_setup_json,
        },
      };
    });
    await runSetupEvent(cloneSetupEvent('3321540248'));
    expect(ProvisionFanout.notify).toHaveBeenCalledWith(expect.any(String), 'provision', db);
  });

  it('checkout setup sin teléfono válido no llama ProvisionFanout.notify', async () => {
    await runSetupEvent(cloneSetupEvent(undefined));
    expect(ProvisionFanout.notify).not.toHaveBeenCalled();
    await runSetupEvent(cloneSetupEvent('+15551234567'));
    expect(ProvisionFanout.notify).not.toHaveBeenCalled();
  });

  it('gRPC: nombres {subdomain}-chatwoot_* / {subdomain}-minio; solo client visible', async () => {
    await runSetupEvent(cloneSetupEvent('+5213321540248'));
    const entries = grpcItems();
    expect(entries).toHaveLength(4);
    const subdomain = 'negocio';
    expect(entries.map((e) => e.name).sort()).toEqual([
      `${subdomain}-chatwoot_client_password`,
      `${subdomain}-chatwoot_crm_admin_password`,
      `${subdomain}-chatwoot_super_admin_password`,
      `${subdomain}-minio`,
    ].sort());
    const visible = entries.filter((e) => e.visibility === true);
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe(`${subdomain}-chatwoot_client_password`);
    for (const entry of entries) {
      expect(entry.updateablebyclient).toBe(false);
    }
  });

  it('gRPC lento/fail → no fanout', async () => {
    CreatePasswordsClient.createPasswords.mockRejectedValueOnce(new Error('UNAVAILABLE'));
    await runSetupEvent(cloneSetupEvent('+5213321540248'));
    expect(ProvisionFanout.notify).not.toHaveBeenCalled();
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
