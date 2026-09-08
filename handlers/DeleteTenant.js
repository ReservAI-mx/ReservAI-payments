const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const { connectDB } = require('../data/connectDB');

const DeleteTenant = async (req, res) => {
    if (req.technical_info.status !== 'pending_provision' || req.technical_info.stripe_subscription_id) {
        return res.status(409).json({ error: 'status=active o hay subscription ligada' });
    }

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }

    const result = await TechnicalInfoManager.deletePending(req.technical_info.id, db);
    if (result.error) {
        return res.status(500).json({ error: result.error });
    }
    if (!result.deleted) {
        return res.status(409).json({ error: 'status=active o hay subscription ligada' });
    }

    return res.status(204).send();
};

module.exports = DeleteTenant;
