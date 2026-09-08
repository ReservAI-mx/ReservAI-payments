const TechnicalInfoManager = require('../utils/TechnicalInfoManager');
const PaginationManager = require('../utils/PaginationManager');
const { connectDB } = require('../data/connectDB');

const TENANT_STATUSES = new Set([
    'all',
    'pending_provision',
    'ready_for_subscription',
    'active',
    'unpaid',
]);

const ListTenants = async (req, res) => {
    let status = req.query.status ? String(req.query.status).trim() : 'all';
    let search = req.query.search ? String(req.query.search).trim() : 'all';
    let page = req.query.page ? parseInt(req.query.page, 10) : 1;
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!status) status = 'all';
    if (!search) search = 'all';
    if (!TENANT_STATUSES.has(status)) {
        return res.status(400).json({ error: 'status de filtro inválido' });
    }
    const limit = parseInt(process.env.LIMIT_PER_PAGE, 10) || 6;

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }

    const { offset } = PaginationManager.GetPagination(page, limit);
    const result = await TechnicalInfoManager.listTenants(
        status,
        search,
        offset,
        limit + 1,
        db
    );
    if (result.error) {
        return res.status(500).json({ error: result.error });
    }

    let data = result.tenants;
    let total = result.tenants.length > limit ? limit : result.tenants.length;
    let next_page = result.tenants.length > limit ? page + 1 : null;
    if (result.tenants.length > limit) {
        data = data.slice(0, limit);
    }

    return res.status(200).json({
        data,
        total,
        message: 'tenants obtenidos',
        next_page,
        current_page: page,
    });
};

module.exports = ListTenants;
