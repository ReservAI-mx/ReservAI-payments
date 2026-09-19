const ProductsManager = require('../utils/ProductsManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');

const ListProducts = async (req, res) => {
  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    captureStripeFailure(error, { phase: 'billing.products.list.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await ProductsManager.list(db);
  if (!result.success) {
    captureStripeFailure(result.error || 'list products failed', {
      phase: 'billing.products.list',
    });
    return res.status(500).json({ error: result.error || 'Error listando productos' });
  }

  return res.status(200).json({
    data: result.products,
    message: 'productos obtenidos',
  });
};

module.exports = ListProducts;
