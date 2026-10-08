const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const { connectDB } = require('../data/connectDB');
const { logAction } = require('../utils/RequestTrace');

const DeleteTenant = async (req, res) => {
    if (req.technical_info.status !== 'pending_provision' || req.technical_info.stripe_subscription_id) {
        logAction(req, 'warning', 'DeleteTenant', `status=${req.technical_info.status} id=${req.technical_info.id}`);
        return res.status(409).json({ error: 'status=active o hay subscription ligada' });
    }

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'DeleteTenant', `db id=${req.technical_info.id}`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }

    const result = await TechnicalInfoManager.deletePending(req.technical_info.id, db);
    if (result.error) {
        logAction(req, 'error', 'DeleteTenant', `delete id=${req.technical_info.id}`);
        return res.status(500).json({ error: result.error });
    }
    if (!result.deleted) {
        logAction(req, 'warning', 'DeleteTenant', `not deleted id=${req.technical_info.id}`);
        return res.status(409).json({ error: 'status=active o hay subscription ligada' });
    }

    logAction(req, 'info', 'DeleteTenant', `ok id=${req.technical_info.id}`);
    return res.status(204).send();
};

module.exports = DeleteTenant;
