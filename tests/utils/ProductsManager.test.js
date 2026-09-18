const ProductsManager = require('../../utils/ProductsManager');

describe('ProductsManager', () => {
  const db = { query: jest.fn() };

  beforeEach(() => {
    db.query.mockReset();
  });

  it('validateCreateInput rejects bad amounts', () => {
    expect(ProductsManager.validateCreateInput({ name: 'A', description: 'B', monthly_amount: 0, setup_amount: 10 }).error).toBeTruthy();
    expect(ProductsManager.validateCreateInput({ name: 'A', description: 'B', monthly_amount: 100, setup_amount: -1 }).error).toBeTruthy();
  });

  it('validateCreateInput accepts valid body', () => {
    const parsed = ProductsManager.validateCreateInput({
      name: ' Básico ',
      description: ' Plan ',
      monthly_amount: 1160,
      setup_amount: 5800,
    });
    expect(parsed.error).toBeUndefined();
    expect(parsed.name).toBe('Básico');
    expect(parsed.monthly_amount).toBe(1160);
  });

  it('createInStripe creates product and 4 prices', async () => {
    const stripe = {
      products: { create: jest.fn().mockResolvedValue({ id: 'prod_1' }) },
      prices: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'price_m' })
          .mockResolvedValueOnce({ id: 'price_mm' })
          .mockResolvedValueOnce({ id: 'price_s' })
          .mockResolvedValueOnce({ id: 'price_sm' }),
      },
    };
    const result = await ProductsManager.createInStripe('Plan', 'Desc', 1000, 5000, stripe);
    expect(result.success).toBe(true);
    expect(result.stripe_product_id).toBe('prod_1');
    expect(stripe.prices.create).toHaveBeenCalledTimes(4);
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: 100000, recurring: { interval: 'month' } })
    );
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: 98750 })
    );
  });

  it('insertInDB and list and setActive', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Plan' }] });
    const inserted = await ProductsManager.insertInDB(
      {
        name: 'Plan',
        description: 'D',
        monthly_amount: 10,
        setup_amount: 20,
        stripe_product_id: 'prod',
        stripe_price_id_monthly: 'a',
        stripe_price_id_monthly_moral: 'b',
        stripe_price_id_setup: 'c',
        stripe_price_id_setup_moral: 'd',
      },
      db
    );
    expect(inserted.success).toBe(true);

    db.query.mockResolvedValueOnce({ rows: [{ id: 'p1' }] });
    const listed = await ProductsManager.list(db);
    expect(listed.products).toHaveLength(1);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [null]);

    db.query.mockResolvedValueOnce({ rows: [{ id: 'p1', active: false }] });
    const updated = await ProductsManager.setActive('p1', false, db);
    expect(updated.product.active).toBe(false);
  });
});
