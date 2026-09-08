const SubscriptionManager = require('../utils/SubscriptionManager');
const PaginationManager = require('../utils/PaginationManager');
const { connectDB } = require('../data/connectDB');

const GetMySubscriptions = async (req, res) => {
    const { customer } = req;
    const { account } = req;
    let page = req.query.page ? parseInt(req.query.page, 10) : 1;
    if (!Number.isFinite(page) || page < 1) page = 1;
    const limit = parseInt(process.env.LIMIT_PER_PAGE, 10) || 6;

    let db = null;
    try {
        db = await connectDB();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }

    const { offset } = PaginationManager.GetPagination(page, limit);
    const result = await SubscriptionManager.getSubscriptionsSummaries(
        customer.stripe_customer_id,
        account.id,
        db,
        offset,
        limit + 1
    );
    if (result.error) {
        return res.status(500).json({ error: result.error });
    }

    let data = result.subscriptions;
    let total = result.subscriptions.length > limit ? limit : result.subscriptions.length;
    let next_page = result.subscriptions.length > limit ? page + 1 : null;
    if (result.subscriptions.length > limit) {
        data = data.slice(0, limit);
    }

    return res.status(200).json({
        data,
        total,
        message: 'Suscripciones obtenidas correctamente',
        next_page,
        current_page: page,
    });
}

module.exports = GetMySubscriptions;
