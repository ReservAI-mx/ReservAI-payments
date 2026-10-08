const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const { logAction } = require('../utils/RequestTrace');

const GetTenant = async (req, res) => {
    logAction(req, 'info', 'GetTenant', `ok id=${req.technical_info.id} status=${req.technical_info.status}`);
    return res.status(200).json(TechnicalInfoManager.publicFields(req.technical_info));
};

module.exports = GetTenant;
