jest.mock('../../utils/InvoiceManager');
jest.mock('../../data/connectDB', () => ({
  connectDB: jest.fn(async () => ({})),
}));

const InvoiceManager = require('../../utils/InvoiceManager');
const CreateInvoiceFromPayment = require('../../handlers/CreateInvoiceFromPayment');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('CreateInvoiceFromPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
