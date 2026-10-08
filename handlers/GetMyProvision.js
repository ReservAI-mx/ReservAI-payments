const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const PaginationManager = require('../utils/PaginationManager');
const { connectDB } = require('../data/connectDB');
const { logAction } = require('../utils/RequestTrace');

const GetMyProvision = async (req, res) => {
    const { account } = req;
    let page = req.query.page ? parseInt(req.query.page, 10) : 1;
    if (!Number.isFinite(page) || page < 1) page = 1;
    const limit = parseInt(process.env.LIMIT_PER_PAGE, 10) || 6;

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        logAction(req, 'error', 'GetMyProvision', `db account=${account.id}`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }

    const { offset } = PaginationManager.GetPagination(page, limit);
    const result = await TechnicalInfoManager.getSetupsByAccountId(
        account.id,
        offset,
        limit + 1,
        db
    );
    if (result.error) {
        logAction(req, 'error', 'GetMyProvision', `list account=${account.id}`);
        return res.status(500).json({ error: result.error });
    }

    let data = result.setups;
    let total = result.setups.length > limit ? limit : result.setups.length;
    let next_page = result.setups.length > limit ? page + 1 : null;
    if (result.setups.length > limit) {
        data = data.slice(0, limit);
    }

    logAction(req, 'info', 'GetMyProvision', `ok account=${account.id} page=${page} count=${data.length}`);
    return res.status(200).json({
        data,
        total,
        message: 'Setups obtenidos',
        next_page,
        current_page: page,
    });
};

module.exports = GetMyProvision;
