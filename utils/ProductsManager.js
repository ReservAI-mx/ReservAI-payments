const InsertProduct = require('../queries/InsertProduct');
const ListProducts = require('../queries/ListProducts');
const SetProductActive = require('../queries/SetProductActive');
const GetProductById = require('../queries/GetProductById');
const GetProductByName = require('../queries/GetProductByName');
const FacturamaClient = require('./FacturamaClient');

const MORAL_FACTOR = 0.9875; // 1.25% menos
const CURRENCY = 'mxn';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

function moralCents(amount) {
  return Math.round(toCents(amount) * MORAL_FACTOR);
}

class ProductsManager {
  static validateCreateInput(body) {
    const name = body?.name != null ? String(body.name).trim() : '';
    const description = body?.description != null ? String(body.description).trim() : '';
    const monthly_amount = Number(body?.monthly_amount);
    const setup_amount = Number(body?.setup_amount);
    const codeFromBody =
      body?.facturama_code_prod_serv != null
        ? String(body.facturama_code_prod_serv).trim()
        : '';
    const facturama_code_prod_serv =
      codeFromBody || process.env.FACTURAMA_PRODUCT_CODE || '81112100';
    const facturama_unit_code = process.env.FACTURAMA_UNIT_CODE || 'E48';
    const facturama_unit = 'Servicio';

    if (!name) return { error: 'name es requerido' };
    if (!description) return { error: 'description es requerido' };
    if (!Number.isFinite(monthly_amount) || monthly_amount <= 0) {
      return { error: 'monthly_amount debe ser mayor a 0' };
    }
    if (!Number.isFinite(setup_amount) || setup_amount <= 0) {
      return { error: 'setup_amount debe ser mayor a 0' };
    }
    if (!facturama_code_prod_serv) {
      return { error: 'facturama_code_prod_serv / FACTURAMA_PRODUCT_CODE requerido' };
    }

    return {
      name,
      description,
      monthly_amount,
      setup_amount,
      facturama_code_prod_serv,
      facturama_unit_code,
      facturama_unit,
    };
  }

  static async createInStripe(name, description, monthly_amount, setup_amount, stripe) {
    try {
      const product = await stripe.products.create({ name, description });
      const monthly = toCents(monthly_amount);
      const monthlyMoral = moralCents(monthly_amount);
      const setup = toCents(setup_amount);
      const setupMoral = moralCents(setup_amount);

      const [priceMonthly, priceMonthlyMoral, priceSetup, priceSetupMoral] = await Promise.all([
        stripe.prices.create({
          product: product.id,
          currency: CURRENCY,
          unit_amount: monthly,
          recurring: { interval: 'month' },
          nickname: `${name} mensual`,
        }),
        stripe.prices.create({
          product: product.id,
          currency: CURRENCY,
          unit_amount: monthlyMoral,
          recurring: { interval: 'month' },
          nickname: `${name} mensual moral`,
        }),
        stripe.prices.create({
          product: product.id,
          currency: CURRENCY,
          unit_amount: setup,
          nickname: `${name} setup`,
        }),
        stripe.prices.create({
          product: product.id,
          currency: CURRENCY,
          unit_amount: setupMoral,
          nickname: `${name} setup moral`,
        }),
      ]);

      return {
        success: true,
        stripe_product_id: product.id,
        stripe_price_id_monthly: priceMonthly.id,
        stripe_price_id_monthly_moral: priceMonthlyMoral.id,
        stripe_price_id_setup: priceSetup.id,
        stripe_price_id_setup_moral: priceSetupMoral.id,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async createInFacturama(parsed, stripeProductId) {
    const payload = {
      Unit: parsed.facturama_unit,
      UnitCode: parsed.facturama_unit_code,
      IdentificationNumber: String(stripeProductId || parsed.name).slice(0, 50),
      Name: String(parsed.name).slice(0, 50),
      Description: parsed.description,
      Price: parsed.monthly_amount,
      CodeProdServ: parsed.facturama_code_prod_serv,
      Taxes: [
        {
          Name: 'IVA',
          Rate: 0.16,
          IsRetention: false,
          IsFederalTax: true,
        },
      ],
    };

    const created = await FacturamaClient.createProduct(payload);
    if (!created.success) {
      return { success: false, error: created.error || 'Error creando producto en Facturama' };
    }

    const facturama_product_id = created.data?.Id || created.data?.id || null;
    if (!facturama_product_id) {
      return { success: false, error: 'Facturama no devolvió Id de producto' };
    }

    return {
      success: true,
      facturama_product_id,
      facturama_code_prod_serv: parsed.facturama_code_prod_serv,
      facturama_unit_code: parsed.facturama_unit_code,
      facturama_unit: parsed.facturama_unit,
    };
  }

  static async insertInDB(row, db) {
    try {
      const result = await db.query(InsertProduct, [
        row.name,
        row.description,
        row.monthly_amount,
        row.setup_amount,
        row.stripe_product_id,
        row.stripe_price_id_monthly,
        row.stripe_price_id_monthly_moral,
        row.stripe_price_id_setup,
        row.stripe_price_id_setup_moral,
        row.facturama_product_id || null,
        row.facturama_code_prod_serv || null,
        row.facturama_unit_code || null,
        row.facturama_unit || null,
      ]);
      return { success: true, product: result.rows[0] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async list(db, activeFilter = null) {
    try {
      const result = await db.query(ListProducts, [activeFilter]);
      return { success: true, products: result.rows };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async setActive(id, active, db) {
    try {
      const result = await db.query(SetProductActive, [id, active]);
      if (!result.rows[0]) {
        return { success: false, error: 'Producto no encontrado', notFound: true };
      }
      return { success: true, product: result.rows[0] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /** Resuelve producto por uuid o por nombre (para activate / planned_plan). */
  static async findForCheckout(planned_plan, db) {
    const key = String(planned_plan || '').trim();
    if (!key) {
      return { success: false, error: 'planned_plan vacío' };
    }
    try {
      let result;
      if (UUID_RE.test(key)) {
        result = await db.query(GetProductById, [key]);
      } else {
        result = await db.query(GetProductByName, [key]);
      }
      if (!result.rows[0]) {
        return { success: false, error: 'Producto no encontrado', notFound: true };
      }
      return { success: true, product: result.rows[0] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ProductsManager;
