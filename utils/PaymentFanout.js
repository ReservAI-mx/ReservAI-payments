const VaultCrypto = require('./VaultCrypto');
const TechnicalInfoManager = require('./TechnicalInfoManager');
const OpsJobManager = require('./OpsJobManager');
const { captureOpsError } = require('./captureOpsError');

const DEFAULT_URL = 'https://knowledge.{subdomain}.reservai.com.mx/webhooks/payment';
const LOCAL_URL = 'http://api:8000/webhooks/payment';

function isProd() {
  return process.env.STAGE === 'production' || process.env.NODE_ENV === 'production';
}

class PaymentFanout {
  static urlFor(subdomain) {
    const template = process.env.PAYMENT_FANOUT_URL || (isProd() ? DEFAULT_URL : LOCAL_URL);
    const url = template.replaceAll('{subdomain}', subdomain);
    if (!isProd() && url.includes('reservai.com.mx')) {
      return LOCAL_URL;
    }
    return url;
  }

  static async deliver(tenant, status) {
    let token = process.env.PAYMENT_FANOUT_TOKEN;
    if (!token) {
      try {
        token = VaultCrypto.decrypt(tenant.inbound_auth_key);
      } catch (err) {
        return { success: false, error: err.message || 'decrypt failed' };
      }
    }
    if (!token) return { success: false, error: 'missing payment token' };

    try {
      const res = await fetch(this.urlFor(tenant.subdomain), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        return { success: false, error: `payment fanout ${res.status}` };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'payment fanout error' };
    }
  }

  /**
   * Enqueue payment_notify + un intento inmediato.
   */
  static async notifyBySubscriptionId(stripe_subscription_id, status, db) {
    if (!stripe_subscription_id) return { success: false, skipped: true };
    try {
      const lookup = await TechnicalInfoManager.getForFanout(stripe_subscription_id, db);
      if (!lookup.success || !lookup.tenant) {
        return { success: false, skipped: true, error: 'no tenant' };
      }
      const tenant = lookup.tenant;
      const enqueued = await OpsJobManager.enqueue(
        {
          action: 'payment_notify',
          technical_info_id: tenant.id,
          payload: { status, stripe_subscription_id },
        },
        db
      );
      const job = enqueued.job;
      if (!job) return { success: false, error: 'enqueue failed' };

      await db.query(
        `UPDATE ops_jobs SET attempts = GREATEST(attempts, 1), updated_at = now() WHERE id = $1`,
        [job.id]
      );

      const delivered = await this.deliver(tenant, status);
      if (delivered.success) {
        await OpsJobManager.markSucceeded(job.id, db);
        return { success: true, job_id: job.id };
      }

      const failed = await OpsJobManager.markFailed(
        job.id,
        delivered.error || 'payment fanout failed',
        1,
        db
      );
      return {
        success: false,
        error: delivered.error,
        job_id: job.id,
        status: failed?.status,
      };
    } catch (err) {
      captureOpsError(err, {
        action: 'payment_notify',
        stripe_subscription_id,
        status,
      });
      return { success: false, error: err.message };
    }
  }
}

module.exports = PaymentFanout;
