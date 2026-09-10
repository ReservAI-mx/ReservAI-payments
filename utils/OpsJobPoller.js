const os = require('os');
const { getDB, connectDB } = require('../data/connectDB');
const OpsJobManager = require('./OpsJobManager');
const ProvisionFanout = require('./ProvisionFanout');
const PaymentFanout = require('./PaymentFanout');
const GetTechnicalInfoById = require('../queries/GetTechnicalInfoById');
const { captureOpsError } = require('./captureOpsError');

const DEFAULT_INTERVAL_MS = 5000;
let timer = null;
let running = false;
const lockedBy = `stripe-poller:${os.hostname()}:${process.pid}`;

async function resolveTenant(job, db) {
  if (!job.technical_info_id) return null;
  const q = await db.query(GetTechnicalInfoById, [job.technical_info_id]);
  return q.rows[0] || null;
}

async function dispatchJob(job, db) {
  if (job.action === 'payment_notify') {
    const tenant = await resolveTenant(job, db);
    if (!tenant) {
      await OpsJobManager.markFailed(job.id, 'tenant missing', job.attempts, db);
      return;
    }
    const status = (job.payload && typeof job.payload === 'object' && job.payload.status)
      || (typeof job.payload === 'string'
        ? (() => { try { return JSON.parse(job.payload).status; } catch { return null; } })()
        : null)
      || 'unpaid';
    const delivered = await PaymentFanout.deliver(tenant, status);
    if (delivered.success) {
      await OpsJobManager.markSucceeded(job.id, db);
      console.log(`[stripe][OpsJobPoller] payment_notify ok job=${job.id}`);
      return;
    }
    await OpsJobManager.markFailed(
      job.id,
      delivered.error || 'payment fanout failed',
      job.attempts,
      db
    );
    return;
  }

  if (!OpsJobManager.isInfraAction(job.action)) {
    await OpsJobManager.markFailed(job.id, `unknown action ${job.action}`, job.attempts, db);
    return;
  }

  const posted = await ProvisionFanout.postJob({
    action: job.action,
    technical_info_id: job.technical_info_id,
    job_id: job.id,
  });
  if (posted.success) {
    await OpsJobManager.markInFlight(job.id, lockedBy, db);
    console.log(`[stripe][OpsJobPoller] in_flight job=${job.id} action=${job.action}`);
    return;
  }
  await OpsJobManager.markFailed(
    job.id,
    posted.error || 'provision fanout failed',
    job.attempts,
    db
  );
}

async function tick() {
  if (running) return;
  running = true;
  try {
    let db;
    try {
      db = getDB();
    } catch {
      db = await connectDB();
    }
    for (let i = 0; i < 5; i++) {
      const job = await OpsJobManager.claimNext(lockedBy, db);
      if (!job) break;
      try {
        await dispatchJob(job, db);
      } catch (err) {
        captureOpsError(err, {
          job_id: job.id,
          action: job.action,
          technical_info_id: job.technical_info_id,
        });
        try {
          await OpsJobManager.markFailed(job.id, err.message, job.attempts, db);
        } catch (markErr) {
          captureOpsError(markErr, { job_id: job.id, phase: 'markFailed' });
        }
      }
    }
  } catch (err) {
    captureOpsError(err, { phase: 'OpsJobPoller.tick' });
  } finally {
    running = false;
  }
}

function start(intervalMs = Number(process.env.OPS_JOB_POLLER_MS) || DEFAULT_INTERVAL_MS) {
  if (timer) return;
  if (process.env.NODE_ENV === 'test') return;
  console.log(`[stripe][OpsJobPoller] start interval=${intervalMs}ms`);
  timer = setInterval(() => {
    tick().catch((err) => captureOpsError(err, { phase: 'OpsJobPoller.interval' }));
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  tick().catch((err) => captureOpsError(err, { phase: 'OpsJobPoller.first' }));
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, tick, lockedBy };
