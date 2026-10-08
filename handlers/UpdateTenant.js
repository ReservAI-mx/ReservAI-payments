const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const { connectDB } = require('../data/connectDB');
const { logAction } = require('../utils/RequestTrace');

const UpdateTenant = async (req, res) => {
    const status = req.body && req.body.status;
    if (status !== 'ready_for_subscription') {
        logAction(req, 'warning', 'UpdateTenant', `invalid status id=${req.technical_info.id}`);
        return res.status(400).json({ error: 'status distinto de ready_for_subscription' });
    }
    if (req.technical_info.status !== 'pending_provision') {
        logAction(req, 'warning', 'UpdateTenant', `status=${req.technical_info.status} id=${req.technical_info.id}`);
        return res.status(409).json({ error: 'No está en pending_provision' });
    }

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'UpdateTenant', `db id=${req.technical_info.id}`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }

    const result = await TechnicalInfoManager.markReady(req.technical_info.id, db);
    if (result.error) {
        logAction(req, 'error', 'UpdateTenant', `update id=${req.technical_info.id}`);
        return res.status(500).json({ error: result.error });
    }
    if (!result.tenant) {
        logAction(req, 'warning', 'UpdateTenant', `not pending id=${req.technical_info.id}`);
        return res.status(409).json({ error: 'No está en pending_provision' });
    }

    logAction(req, 'info', 'UpdateTenant', `ok id=${result.tenant.id} status=${result.tenant.status}`);
    return res.status(200).json(TechnicalInfoManager.publicFields(result.tenant));
};

module.exports = UpdateTenant;
