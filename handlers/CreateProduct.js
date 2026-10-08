const ProductsManager = require('../utils/ProductsManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const CreateProduct = async (req, res) => {
  const parsed = ProductsManager.validateCreateInput(req.body);
  if (parsed.error) {
    logAction(req, 'warning', 'CreateProduct', 'invalid input');
    return res.status(400).json({ error: parsed.error });
  }

  let stripe = null;
  try {
    stripe = await getStripeInstance();
  } catch (error) {
    logAction(req, 'error', 'CreateProduct', 'stripe', error);
    captureStripeFailure(error, { phase: 'billing.products.getStripe' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const stripeResult = await ProductsManager.createInStripe(
    parsed.name,
    parsed.description,
    parsed.monthly_amount,
    parsed.setup_amount,
    stripe
  );
  if (!stripeResult.success) {
    logAction(req, 'error', 'CreateProduct', 'stripe create');
    captureStripeFailure(stripeResult.error || 'createInStripe failed', {
      phase: 'billing.products.createStripe',
    });
    return res.status(500).json({ error: stripeResult.error || 'Error creando precios en Stripe' });
  }

  const facturamaResult = await ProductsManager.createInFacturama(
    parsed,
    stripeResult.stripe_product_id
  );
  let facturama_pending = false;
  if (!facturamaResult.success) {
    facturama_pending = true;
    captureStripeFailure(facturamaResult.error || 'createInFacturama failed', {
      phase: 'billing.products.createFacturama',
      stripe_product_id: stripeResult.stripe_product_id,
    });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'CreateProduct', `db stripe_product=${stripeResult.stripe_product_id}`, error);
    captureStripeFailure(error, { phase: 'billing.products.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const insert = await ProductsManager.insertInDB(
    {
      name: parsed.name,
      description: parsed.description,
      monthly_amount: parsed.monthly_amount,
      setup_amount: parsed.setup_amount,
      stripe_product_id: stripeResult.stripe_product_id,
      stripe_price_id_monthly: stripeResult.stripe_price_id_monthly,
      stripe_price_id_monthly_moral: stripeResult.stripe_price_id_monthly_moral,
      stripe_price_id_setup: stripeResult.stripe_price_id_setup,
      stripe_price_id_setup_moral: stripeResult.stripe_price_id_setup_moral,
      facturama_product_id: facturamaResult.success
        ? facturamaResult.facturama_product_id
        : null,
      facturama_code_prod_serv:
        facturamaResult.facturama_code_prod_serv || parsed.facturama_code_prod_serv,
      facturama_unit_code: facturamaResult.facturama_unit_code || parsed.facturama_unit_code,
      facturama_unit: facturamaResult.facturama_unit || parsed.facturama_unit,
    },
    db
  );
  if (!insert.success) {
    logAction(req, 'error', 'CreateProduct', `insert stripe_product=${stripeResult.stripe_product_id}`);
    captureStripeFailure(insert.error || 'insertInDB failed', {
      phase: 'billing.products.insertDB',
      stripe_product_id: stripeResult.stripe_product_id,
      facturama_product_id: facturamaResult.facturama_product_id,
    });
    return res.status(500).json({ error: insert.error || 'Error guardando producto' });
  }

  logAction(req, 'info', 'CreateProduct', `ok stripe_product=${stripeResult.stripe_product_id} facturama_pending=${facturama_pending}`);
  return res.status(201).json({
    data: insert.product,
    facturama_pending,
    message: facturama_pending
      ? 'producto creado en Stripe y DB; Facturama pendiente de sincronizar'
      : 'producto creado en Stripe, Facturama y DB',
  });
};

module.exports = CreateProduct;
