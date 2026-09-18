const ProductsManager = require('../utils/ProductsManager');
const { connectDB } = require('../data/connectDB');

const ListProducts = async (req, res) => {
  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await ProductsManager.list(db);
  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Error listando productos' });
  }

  return res.status(200).json({
    data: result.products,
    message: 'productos obtenidos',
  });
};

module.exports = ListProducts;
