const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');
const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const { connectDB } = require('../data/connectDB');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TechnicalInfoExistByID = async (req, res, next) => {
    const id = req.params.id;
    if (!UUID_RE.test(String(id || ''))) {
        logAction(req, 'warning', 'TechnicalInfoExistByID', 'invalid id');
        return res.status(400).json({ error: 'id inválido' });
    }
    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'TechnicalInfoExistByID', 'db', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
    const result = await TechnicalInfoManager.getById(id, db);
    if (result.error) {
        logAction(req, 'error', 'TechnicalInfoExistByID', `lookup id=${id}`);
        return res.status(500).json({ error: result.error });
    }
    if (!result.tenant) {
        logAction(req, 'warning', 'TechnicalInfoExistByID', `missing id=${id}`);
        return res.status(404).json({ error: 'technical_info no existe' });
    }
    req.technical_info = result.tenant;
    addRequestTraceStep(req, 'TechnicalInfoExistByID', {
        technical_info_id: String(result.tenant.id),
        status: result.tenant.status,
    });
    next();
};

module.exports = TechnicalInfoExistByID;
