const ProductsManager = require('../utils/ProductsManager');
const getStripeInstance = require('../data/StripeInstanceGetter');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

const CreateProduct = async (req, res) => {
  const parsed = ProductsManager.validateCreateInput(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  let stripe = null;
  try {
    stripe = await getStripeInstance();
  } catch (error) {
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
    captureStripeFailure(stripeResult.error || 'createInStripe failed', {
      phase: 'billing.products.createStripe',
    });
    return res.status(500).json({ error: stripeResult.error || 'Error creando precios en Stripe' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
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
    },
    db
  );
  if (!insert.success) {
    captureStripeFailure(insert.error || 'insertInDB failed', {
      phase: 'billing.products.insertDB',
      stripe_product_id: stripeResult.stripe_product_id,
    });
    return res.status(500).json({ error: insert.error || 'Error guardando producto' });
  }

  return res.status(201).json({
    data: insert.product,
    message: 'producto creado',
  });
};

module.exports = CreateProduct;
