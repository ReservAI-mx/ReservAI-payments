const ProductsManager = require('../utils/ProductsManager');
const { connectDB } = require('../data/connectDB');
const { captureStripeFailure } = require('../utils/captureOpsError');
const { logAction } = require('../utils/RequestTrace');

const UpdateProduct = async (req, res) => {
  const id = req.params?.id ? String(req.params.id).trim() : '';
  if (!id) {
    logAction(req, 'warning', 'UpdateProduct', 'missing id');
    return res.status(400).json({ error: 'id es requerido' });
  }

  if (typeof req.body?.active !== 'boolean') {
    logAction(req, 'warning', 'UpdateProduct', `invalid active id=${id}`);
    return res.status(400).json({ error: 'active debe ser boolean' });
  }

  let db = null;
  try {
    db = await connectDB();
  } catch (error) {
    logAction(req, 'error', 'UpdateProduct', `db id=${id}`, error);
    captureStripeFailure(error, { phase: 'billing.products.update.connectDB' });
    return res.status(500).json({ error: 'Internal server error' });
  }

  const result = await ProductsManager.setActive(id, req.body.active, db);
  if (result.notFound) {
    logAction(req, 'warning', 'UpdateProduct', `missing id=${id}`);
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  if (!result.success) {
    logAction(req, 'error', 'UpdateProduct', `update id=${id}`);
    captureStripeFailure(result.error || 'setActive failed', {
      phase: 'billing.products.update',
    });
    return res.status(500).json({ error: result.error || 'Error actualizando producto' });
  }

  logAction(req, 'info', 'UpdateProduct', `ok id=${id} active=${req.body.active}`);
  return res.status(200).json({
    data: result.product,
    message: 'producto actualizado',
  });
};

module.exports = UpdateProduct;
