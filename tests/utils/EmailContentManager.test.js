const EmailContentManager = require('../../utils/EmailContentManager');

describe('EmailContentManager', () => {
  const subscriptionData = {
    plan_name: 'Plan Premium',
    amount: 99900,
    current_period_start: 1700000000,
    current_period_end: 1702678400,
    status: 'active',
  };

  it('returns content for subscription.created', async () => {
    const content = await EmailContentManager.getEmailContent(
      'User',
      'customer.subscription.created',
      subscriptionData
    );
    expect(content.subject).toBeTruthy();
  });

  it('returns null for unknown event', async () => {
    const content = await EmailContentManager.getEmailContent('User', 'unknown.event', {});
    expect(content).toBeNull();
  });

  it('returns internal payment failed content', async () => {
    const content = await EmailContentManager.getInternalPaymentFailedContent('User', {
      payment_kind: 'suscripción',
      customer_email: 'u@example.com',
      amount_due: 99900,
      currency: 'usd',
    });
    expect(content.subject).toContain('Pago fallido');
    expect(content.content).toContain('suscripción');
  });

  it('returns customer setup paid content', async () => {
    const content = await EmailContentManager.getEmailContent('User', 'checkout.session.completed', {
      subdomain: 'negocio',
      planned_plan: 'basico',
      amount_total: 50000,
      currency: 'usd',
    });
    expect(content.subject).toContain('anticipo');
    expect(content.content).toContain('negocio');
  });

  it('returns internal setup paid content', async () => {
    const content = await EmailContentManager.getInternalSetupPaidContent('User', {
      subdomain: 'negocio',
      planned_plan: 'basico',
      amount_total: 50000,
      currency: 'usd',
    });
    expect(content.subject).toContain('Anticipo pagado');
    expect(content.content).toContain('negocio');
  });
});
