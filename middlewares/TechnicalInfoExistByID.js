const { addRequestTraceStep } = require('../utils/RequestTrace');
const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const { connectDB } = require('../data/connectDB');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TechnicalInfoExistByID = async (req, res, next) => {
    const id = req.params.id;
    if (!UUID_RE.test(String(id || ''))) {
        return res.status(400).json({ error: 'id inválido' });
    }
    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
    const result = await TechnicalInfoManager.getById(id, db);
    if (result.error) {
        return res.status(500).json({ error: result.error });
    }
    if (!result.tenant) {
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
