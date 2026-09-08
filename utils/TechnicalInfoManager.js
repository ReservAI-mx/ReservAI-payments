const InsertTechnicalInfo = require('../queries/InsertTechnicalInfo');
const GetSetupsByAccountId = require('../queries/GetSetupsByAccountId');
const GetSetupForActivate = require('../queries/GetSetupForActivate');
const SubdomainTaken = require('../queries/SubdomainTaken');
const GetTechnicalInfoById = require('../queries/GetTechnicalInfoById');
const ListTenants = require('../queries/ListTenants');
const MarkTenantReady = require('../queries/MarkTenantReady');
const DeletePendingTenant = require('../queries/DeletePendingTenant');
const LinkSubscriptionToTenant = require('../queries/LinkSubscriptionToTenant');
const SetTenantStatus = require('../queries/SetTenantStatus');
const SetTenantStatusBySubscriptionId = require('../queries/SetTenantStatusBySubscriptionId');
const GetTenantForFanout = require('../queries/GetTenantForFanout');

function fail(error) {
    return { success: false, error: error.message };
}

class TechnicalInfoManager {
    static publicFields(row) {
        if (!row) return null;
        return {
            id: row.id,
            account_id: row.account_id,
            account_name: row.account_name,
            subdomain: row.subdomain,
            status: row.status,
            planned_plan: row.planned_plan,
            created_at: row.created_at,
            stripe_subscription_id: row.stripe_subscription_id || null,
        };
    }

    static async subdomainTaken(subdomain, db) {
        try {
            const result = await db.query(SubdomainTaken, [subdomain]);
            return { success: true, taken: result.rows.length > 0 };
        } catch (error) {
            return fail(error);
        }
    }

    static async insertFromSetupSession(row, db) {
        try {
            const result = await db.query(InsertTechnicalInfo, [
                row.id,
                row.account_id,
                row.subdomain,
                row.planned_plan,
                row.inbound_auth_key,
                row.setup_session_id,
            ]);
            return { success: true, tenant: result.rows[0] || null };
        } catch (error) {
            return fail(error);
        }
    }

    static async getSetupsByAccountId(account_id, offset, limit, db) {
        try {
            const result = await db.query(GetSetupsByAccountId, [account_id, limit, offset]);
            return { success: true, setups: result.rows, count: result.rows.length };
        } catch (error) {
            return fail(error);
        }
    }

    static async getSetupForActivate(id, account_id, db) {
        try {
            const result = await db.query(GetSetupForActivate, [id, account_id]);
            return { success: true, setup: result.rows[0] || null };
        } catch (error) {
            return fail(error);
        }
    }

    static async getById(id, db) {
        try {
            const result = await db.query(GetTechnicalInfoById, [id]);
            return { success: true, tenant: result.rows[0] || null };
        } catch (error) {
            return fail(error);
        }
    }

    static async listTenants(status, search, offset, limit, db) {
        try {
            const result = await db.query(ListTenants, [status, search, limit, offset]);
            return { success: true, tenants: result.rows, count: result.rows.length };
        } catch (error) {
            return fail(error);
        }
    }

    static async markReady(id, db) {
        try {
            const result = await db.query(MarkTenantReady, [id]);
            return { success: true, tenant: result.rows[0] || null };
        } catch (error) {
            return fail(error);
        }
    }

    static async deletePending(id, db) {
        try {
            const result = await db.query(DeletePendingTenant, [id]);
            return { success: true, deleted: result.rows.length > 0 };
        } catch (error) {
            return fail(error);
        }
    }

    static async linkSubscription(technical_info_id, stripe_subscription_id, db) {
        try {
            const result = await db.query(LinkSubscriptionToTenant, [
                technical_info_id,
                stripe_subscription_id,
            ]);
            return { success: true, linked: result.rows[0] || null };
        } catch (error) {
            return fail(error);
        }
    }

    static async setStatus(id, status, db) {
        try {
            const result = await db.query(SetTenantStatus, [id, status]);
            return { success: true, tenant: result.rows[0] || null };
        } catch (error) {
            return fail(error);
        }
    }

    static async setStatusBySubscriptionId(stripe_subscription_id, status, db) {
        try {
            const result = await db.query(SetTenantStatusBySubscriptionId, [
                stripe_subscription_id,
                status,
            ]);
            return { success: true, tenant: result.rows[0] || null };
        } catch (error) {
            return fail(error);
        }
    }

    static async getForFanout(stripe_subscription_id, db) {
        try {
            const result = await db.query(GetTenantForFanout, [stripe_subscription_id]);
            return { success: true, tenant: result.rows[0] || null };
        } catch (error) {
            return fail(error);
        }
    }
}

module.exports = TechnicalInfoManager;
