const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const { connectDB } = require('../data/connectDB');

const UpdateTenant = async (req, res) => {
    const status = req.body && req.body.status;
    if (status !== 'ready_for_subscription') {
        return res.status(400).json({ error: 'status distinto de ready_for_subscription' });
    }
    if (req.technical_info.status !== 'pending_provision') {
        return res.status(409).json({ error: 'No está en pending_provision' });
    }

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }

    const result = await TechnicalInfoManager.markReady(req.technical_info.id, db);
    if (result.error) {
        return res.status(500).json({ error: result.error });
    }
    if (!result.tenant) {
        return res.status(409).json({ error: 'No está en pending_provision' });
    }

    return res.status(200).json(TechnicalInfoManager.publicFields(result.tenant));
};

module.exports = UpdateTenant;
