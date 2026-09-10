const crypto = require('crypto');
const { connectDB } = require('../data/connectDB');
const OpsJobManager = require('./OpsJobManager');
const { captureOpsError } = require('./captureOpsError');

const DEFAULT_URL = 'http://passmanager-provision.flycast/jobs';

function createHMAC(data, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(data).digest('hex')}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class ProvisionFanout {
  static url() {
    return process.env.PROVISION_WORKER_URL || DEFAULT_URL;
  }

  static async postJob({ action, technical_info_id, job_id }) {
    const secret = process.env.PROVISION_SECRET_KEY;
    if (!secret) {
      return { success: false, error: 'missing secret' };
    }
    const body = { action, technical_info_id, job_id };
    const raw = JSON.stringify(body);
    const url = this.url();
    console.log(`[stripe][ProvisionFanout] POST ${url} action=${action} id=${technical_info_id} job=${job_id}`);

    let lastErr;
    for (let i = 0; i < 3; i++) {
      const ts = Math.floor(Date.now() / 1000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Provision-Timestamp': String(ts),
            'X-Provision-Signature': createHMAC(`PROVISION\n${ts}\n${raw}`, secret),
          },
          body: raw,
        });
        if (res.status === 202) {
          console.log(`[stripe][ProvisionFanout] accepted 202 (attempt ${i + 1})`);
          return { success: true };
        }
        lastErr = new Error(`provision worker ${res.status}`);
        console.warn(`[stripe][ProvisionFanout] attempt ${i + 1} → ${res.status}`);
      } catch (err) {
        lastErr = err;
        console.warn(`[stripe][ProvisionFanout] attempt ${i + 1} error: ${err.message}`);
      }
      await sleep(400 * (i + 1));
    }
    return { success: false, error: lastErr?.message || 'provision fanout failed' };
  }

  /**
   * Enqueue + un intento inmediato. Si no hay 202, queda queued/failed para el poller.
   */
  static async notify(technical_info_id, action = 'provision', db = null, payload = {}) {
    if (!technical_info_id) return { success: false, skipped: true };
    if (!process.env.PROVISION_SECRET_KEY) {
      console.error('PROVISION_SECRET_KEY missing');
      captureOpsError(new Error('PROVISION_SECRET_KEY missing'), {
        action,
        technical_info_id,
      });
      return { success: false, error: 'missing secret' };
    }

    let conn = db;
    try {
      if (!conn) {
        conn = await connectDB();
      }
      const enqueued = await OpsJobManager.enqueue(
        { action, technical_info_id, payload },
        conn
      );
      const job = enqueued.job;
      if (!job) return { success: false, error: 'enqueue failed' };

      await conn.query(
        `UPDATE ops_jobs SET attempts = GREATEST(attempts, 1), updated_at = now() WHERE id = $1`,
        [job.id]
      );

      const posted = await this.postJob({
        action,
        technical_info_id,
        job_id: job.id,
      });
      if (posted.success) {
        await OpsJobManager.markInFlight(job.id, 'enqueue', conn);
        return { success: true, job_id: job.id };
      }

      const failed = await OpsJobManager.markFailed(
        job.id,
        posted.error || 'provision fanout failed',
        1,
        conn
      );
      console.error('ProvisionFanout failed', technical_info_id, action, posted.error);
      return {
        success: false,
        error: posted.error,
        job_id: job.id,
        status: failed?.status,
      };
    } catch (err) {
      captureOpsError(err, { action, technical_info_id });
      return { success: false, error: err.message };
    }
  }
}

module.exports = ProvisionFanout;
