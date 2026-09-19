jest.mock('../../utils/InvoiceManager');
jest.mock('../../utils/EmailManager');
jest.mock('../../data/connectDB', () => ({
  connectDB: jest.fn(async () => ({})),
}));
jest.mock('../../utils/captureOpsError', () => ({
  captureStripeFailure: jest.fn((e) => (e instanceof Error ? e : new Error(String(e)))),
}));

const InvoiceManager = require('../../utils/InvoiceManager');
const EmailManager = require('../../utils/EmailManager');
const { captureStripeFailure } = require('../../utils/captureOpsError');
const CreateInvoiceFromPayment = require('../../handlers/CreateInvoiceFromPayment');
const { toClientError } = CreateInvoiceFromPayment;
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('CreateInvoiceFromPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    EmailManager.sendEmailToInternalTeam.mockResolvedValue({ success: true });
  });

  it('rejects invalid uuid', async () => {
    const res = createMockRes();
    await CreateInvoiceFromPayment(
      createMockReq({ params: { payment_history_id: 'nope' }, account: { id: 'a', email: 'e@x.com' } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 MONTH_EXPIRED', async () => {
    InvoiceManager.createFromPayment.mockResolvedValue({
      success: false,
      error: 'MONTH_EXPIRED',
      status: 409,
    });
    const res = createMockRes();
    await CreateInvoiceFromPayment(
      createMockReq({
        params: { payment_history_id: '11111111-1111-1111-1111-111111111111' },
        account: { id: 'a', email: 'e@x.com' },
      }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res._json.error).toBe('MONTH_EXPIRED');
    expect(captureStripeFailure).not.toHaveBeenCalled();
    expect(EmailManager.sendEmailToInternalTeam).not.toHaveBeenCalled();
  });

  it('returns FACTURAMA_UNAVAILABLE and emails internal team on stamp fail', async () => {
    InvoiceManager.createFromPayment.mockResolvedValue({
      success: false,
      error: 'FACTURAMA_UNAVAILABLE',
      detail: 'El certificado no puede ser nulo',
      status: 503,
    });
    const res = createMockRes();
    await CreateInvoiceFromPayment(
      createMockReq({
        params: { payment_history_id: '11111111-1111-1111-1111-111111111111' },
        account: { id: 'acc-1', email: 'e@x.com', name: 'Cliente' },
      }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res._json.error).toBe('FACTURAMA_UNAVAILABLE');
    expect(captureStripeFailure).toHaveBeenCalledWith(
      'El certificado no puede ser nulo',
      expect.objectContaining({ phase: 'billing.invoices.create', area: 'facturama' })
    );
    await Promise.resolve();
    expect(EmailManager.sendEmailToInternalTeam).toHaveBeenCalledWith(
      '[ReservAI] Falló solicitud de factura',
      expect.stringContaining('acc-1'),
      expect.stringContaining('payment_history_id')
    );
  });

  it('toClientError keeps business codes', () => {
    expect(toClientError({ error: 'FISCAL_NOT_READY', status: 400 })).toEqual({
      status: 400,
      error: 'FISCAL_NOT_READY',
    });
    expect(toClientError({ error: 'FACTURAMA_UNAVAILABLE', status: 503 })).toEqual({
      status: 503,
      error: 'FACTURAMA_UNAVAILABLE',
    });
  });

  it('returns 201 when created', async () => {
    InvoiceManager.createFromPayment.mockResolvedValue({
      success: true,
      already_exists: false,
      invoice: { id: 'inv-1' },
    });
    const res = createMockRes();
    await CreateInvoiceFromPayment(
      createMockReq({
        params: { payment_history_id: '11111111-1111-1111-1111-111111111111' },
        account: { id: 'a', email: 'e@x.com' },
      }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res._json.data.id).toBe('inv-1');
  });
});
