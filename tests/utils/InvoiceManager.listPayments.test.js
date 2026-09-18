const InvoiceManager = require('../../utils/InvoiceManager');
const FiscalInfoManager = require('../../utils/FiscalInfoManager');

jest.mock('../../utils/FiscalInfoManager');

describe('InvoiceManager payment list enrichment', () => {
  const fiscalReady = {
    active: true,
    authorization_accepted: true,
    sat_validation_status: 'valid',
  };

  test('can_invoice true when no invoice, current month, fiscal ready', () => {
    const now = new Date();
    const item = InvoiceManager.enrichPaymentListItem(
      {
        id: 'p1',
        created_at: now,
        amount: 499,
        status: 'paid',
        stripe_invoice_id: 'in_1',
        ticket_pdf: 'https://stripe.test/pdf',
        invoice_id: null,
      },
      fiscalReady
    );
    expect(item.can_invoice).toBe(true);
    expect(item.invoice_blocked_reason).toBeNull();
    expect(item.ticket_available).toBe(true);
  });

  test('already_invoiced blocks can_invoice', () => {
    const item = InvoiceManager.enrichPaymentListItem(
      {
        id: 'p1',
        created_at: new Date(),
        amount: 10,
        status: 'paid',
        invoice_id: 'inv-1',
        invoice_number: '1',
        facturama_uuid: 'uuid',
        ticket_pdf: null,
        stripe_invoice_id: 'in_1',
      },
      fiscalReady
    );
    expect(item.can_invoice).toBe(false);
    expect(item.invoice_blocked_reason).toBe('already_invoiced');
    expect(item.invoice_id).toBe('inv-1');
  });

  test('month_expired when payment outside current CDMX month', () => {
    const item = InvoiceManager.enrichPaymentListItem(
      {
        id: 'p1',
        created_at: new Date('2020-01-15T12:00:00Z'),
        amount: 10,
        status: 'paid',
        invoice_id: null,
        stripe_invoice_id: 'in_1',
      },
      fiscalReady
    );
    expect(item.can_invoice).toBe(false);
    expect(item.invoice_blocked_reason).toBe('month_expired');
  });

  test('fiscal_not_ready when SAT not valid', () => {
    const item = InvoiceManager.enrichPaymentListItem(
      {
        id: 'p1',
        created_at: new Date(),
        amount: 10,
        status: 'paid',
        invoice_id: null,
        stripe_invoice_id: 'in_1',
      },
      { active: true, authorization_accepted: true, sat_validation_status: 'pending' }
    );
    expect(item.can_invoice).toBe(false);
    expect(item.invoice_blocked_reason).toBe('fiscal_not_ready');
  });

  test('listByAccount returns enriched payments', async () => {
    FiscalInfoManager.getByAccountId.mockResolvedValue({
      success: true,
      fiscal: fiscalReady,
    });
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'p1',
              created_at: new Date(),
              amount: 100,
              status: 'paid',
              stripe_invoice_id: 'in_1',
              ticket_pdf: 'https://x',
              invoice_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }),
    };
    const r = await InvoiceManager.listByAccount('a1', { limit: 20, offset: 0 }, db);
    expect(r.success).toBe(true);
    expect(r.total).toBe(1);
    expect(r.payments).toHaveLength(1);
    expect(r.payments[0].can_invoice).toBe(true);
  });
});
