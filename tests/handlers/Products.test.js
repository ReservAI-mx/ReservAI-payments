jest.mock('../../data/StripeInstanceGetter');
jest.mock('../../utils/ProductsManager');
jest.mock('../../data/connectDB', () => ({
  connectDB: jest.fn(async () => ({})),
}));

const getStripeInstance = require('../../data/StripeInstanceGetter');
const ProductsManager = require('../../utils/ProductsManager');
const CreateProduct = require('../../handlers/CreateProduct');
const ListProducts = require('../../handlers/ListProducts');
const UpdateProduct = require('../../handlers/UpdateProduct');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('products handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CreateProduct rejects invalid body', async () => {
    ProductsManager.validateCreateInput.mockReturnValue({ error: 'name es requerido' });
    const res = createMockRes();
    await CreateProduct(createMockReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(getStripeInstance).not.toHaveBeenCalled();
  });

  it('CreateProduct creates via Stripe, Facturama then DB', async () => {
    ProductsManager.validateCreateInput.mockReturnValue({
      name: 'Plan',
      description: 'D',
      monthly_amount: 100,
      setup_amount: 500,
      facturama_code_prod_serv: '81112100',
      facturama_unit_code: 'E48',
      facturama_unit: 'Servicio',
    });
    getStripeInstance.mockResolvedValue({});
    ProductsManager.createInStripe.mockResolvedValue({
      success: true,
      stripe_product_id: 'prod_1',
      stripe_price_id_monthly: 'pm',
      stripe_price_id_monthly_moral: 'pmm',
      stripe_price_id_setup: 'ps',
      stripe_price_id_setup_moral: 'psm',
    });
    ProductsManager.createInFacturama.mockResolvedValue({
      success: true,
      facturama_product_id: 'fac_1',
      facturama_code_prod_serv: '81112100',
      facturama_unit_code: 'E48',
      facturama_unit: 'Servicio',
    });
    ProductsManager.insertInDB.mockResolvedValue({
      success: true,
      product: { id: 'uuid-1', name: 'Plan', facturama_product_id: 'fac_1' },
    });
    const res = createMockRes();
    await CreateProduct(createMockReq({ body: { name: 'Plan' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res._json.data.id).toBe('uuid-1');
    expect(ProductsManager.createInFacturama).toHaveBeenCalled();
  });

  it('CreateProduct saves with facturama_pending when Facturama fails', async () => {
    ProductsManager.validateCreateInput.mockReturnValue({
      name: 'Plan',
      description: 'D',
      monthly_amount: 100,
      setup_amount: 500,
      facturama_code_prod_serv: '81112100',
      facturama_unit_code: 'E48',
      facturama_unit: 'Servicio',
    });
    getStripeInstance.mockResolvedValue({});
    ProductsManager.createInStripe.mockResolvedValue({
      success: true,
      stripe_product_id: 'prod_1',
      stripe_price_id_monthly: 'pm',
      stripe_price_id_monthly_moral: 'pmm',
      stripe_price_id_setup: 'ps',
      stripe_price_id_setup_moral: 'psm',
    });
    ProductsManager.createInFacturama.mockResolvedValue({
      success: false,
      error: 'Facturama boom',
    });
    ProductsManager.insertInDB.mockResolvedValue({
      success: true,
      product: { id: 'uuid-1', name: 'Plan', facturama_product_id: null },
    });
    const res = createMockRes();
    await CreateProduct(createMockReq({ body: { name: 'Plan' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res._json.facturama_pending).toBe(true);
    expect(ProductsManager.insertInDB).toHaveBeenCalledWith(
      expect.objectContaining({ facturama_product_id: null, stripe_product_id: 'prod_1' }),
      expect.anything()
    );
  });

  it('ListProducts returns rows', async () => {
    ProductsManager.list.mockResolvedValue({ success: true, products: [{ id: '1' }] });
    const res = createMockRes();
    await ListProducts(createMockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.data).toHaveLength(1);
  });

  it('UpdateProduct requires boolean active', async () => {
    const res = createMockRes();
    await UpdateProduct(createMockReq({ params: { id: 'p1' }, body: { active: 'yes' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('UpdateProduct sets active', async () => {
    ProductsManager.setActive.mockResolvedValue({
      success: true,
      product: { id: 'p1', active: false },
    });
    const res = createMockRes();
    await UpdateProduct(createMockReq({ params: { id: 'p1' }, body: { active: false } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.data.active).toBe(false);
  });
});
