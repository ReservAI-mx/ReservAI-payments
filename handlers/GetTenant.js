const TechnicalInfoManager = require('../utils/TechnicalInfoManager');

const GetTenant = async (req, res) => {
    return res.status(200).json(TechnicalInfoManager.publicFields(req.technical_info));
};

module.exports = GetTenant;
