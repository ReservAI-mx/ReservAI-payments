const { connectDB } = require('../data/connectDB');
const OpsJobManager = require('../utils/OpsJobManager');
const PaginationManager = require('../utils/PaginationManager');

const DEFAULT_STATUS = 'failed,dead';
const PAGE_SIZE = Math.min(
  Math.max(parseInt(process.env.OPS_JOBS_LIMIT_PER_PAGE, 10) || 20, 1),
  200
);

const ListJobs = async (req, res) => {
  let db;
  try {
    db = await connectDB();
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }

  const statusRaw = req.query.status != null ? String(req.query.status).trim() : '';
  const status = statusRaw || DEFAULT_STATUS;
  const actionRaw = req.query.action != null ? String(req.query.action).trim() : '';
  const action = !actionRaw || actionRaw === 'all' ? null : actionRaw;

  const searchRaw =
    req.query.search != null
      ? String(req.query.search).trim()
      : req.query.q != null
        ? String(req.query.q).trim()
        : '';
  const search = !searchRaw || searchRaw === 'all' ? null : searchRaw;

  let page = parseInt(req.query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  const limit = PAGE_SIZE;
  const { offset } = PaginationManager.GetPagination(page, limit);

  try {
    const result = await OpsJobManager.list(
      { status, action, q: search, limit, offset },
      db
    );
    const total = result.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return res.status(200).json({
      jobs: result.jobs,
      total,
      page,
      current_page: page,
      limit,
      total_pages: totalPages,
      next_page: page < totalPages ? page + 1 : null,
      status,
      action: action || 'all',
      search: search || '',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = ListJobs;
