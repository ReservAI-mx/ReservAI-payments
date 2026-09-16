jest.mock('../../utils/InvoiceManager');
jest.mock('../../data/connectDB', () => ({
  connectDB: jest.fn(async () => ({})),
}));

const InvoiceManager = require('../../utils/InvoiceManager');
const { ListMyPayments, ListAccountPayments } = require('../../handlers/ListPayments');
const CreateInvoiceFromPayment = require('../../handlers/CreateInvoiceFromPayment');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('ListPayments handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ListMyPayments returns client account payments', async () => {
    InvoiceManager.listByAccount.mockResolvedValue({
      success: true,
      payments: [{ id: 'p1', can_invoice: true }],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const res = createMockRes();
    await ListMyPayments(
      createMockReq({ account: { id: 'acc-client' }, query: {} }),
      res
    );
    expect(InvoiceManager.listByAccount).toHaveBeenCalledWith(
      'acc-client',
      expect.any(Object),
      expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.data[0].id).toBe('p1');
  });

  it('ListAccountPayments rejects invalid account_id', async () => {
    const res = createMockRes();
    await ListAccountPayments(
      createMockReq({ params: { account_id: 'bad' }, account: { id: 'admin' } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(InvoiceManager.listByAccount).not.toHaveBeenCalled();
  });

  it('ListAccountPayments lists for target account_id', async () => {
    InvoiceManager.listByAccount.mockResolvedValue({
      success: true,
      payments: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    const accountId = '11111111-1111-1111-1111-111111111111';
    const res = createMockRes();
    await ListAccountPayments(
      createMockReq({
        params: { account_id: accountId },
        account: { id: 'admin' },
        query: { limit: '10', offset: '0' },
      }),
      res
    );
    expect(InvoiceManager.listByAccount).toHaveBeenCalledWith(
      accountId,
      expect.objectContaining({ limit: 10, offset: 0 }),
      expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('CreateInvoiceFromPayment admin path uses params.account_id', async () => {
    const accountId = '11111111-1111-1111-1111-111111111111';
    const paymentId = '22222222-2222-2222-2222-222222222222';
    InvoiceManager.createFromPayment.mockResolvedValue({
      success: true,
      already_exists: false,
      invoice: { id: 'inv-1' },
    });
    const res = createMockRes();
    await CreateInvoiceFromPayment(
      createMockReq({
        params: { account_id: accountId, payment_history_id: paymentId },
        account: { id: 'admin-id', email: 'admin@x.com' },
      }),
      res
    );
    expect(InvoiceManager.createFromPayment).toHaveBeenCalledWith(
      accountId,
      paymentId,
      'admin@x.com',
      expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
