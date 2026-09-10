const EnqueueOpsJob = require('../queries/EnqueueOpsJob');
const ClaimOpsJob = require('../queries/ClaimOpsJob');
const MarkOpsJobInFlight = require('../queries/MarkOpsJobInFlight');
const MarkOpsJobSucceeded = require('../queries/MarkOpsJobSucceeded');
const MarkOpsJobFailed = require('../queries/MarkOpsJobFailed');
const RetryOpsJob = require('../queries/RetryOpsJob');
const ListOpsJobs = require('../queries/ListOpsJobs');
const CountOpsJobs = require('../queries/CountOpsJobs');
const GetOpsJobById = require('../queries/GetOpsJobById');
const { captureOpsError } = require('./captureOpsError');

const INFRA_ACTIONS = new Set(['provision', 'disable_renewal', 'enable_renewal']);

function backoffMs(attempt) {
  const base = 400 * 2 ** Math.max(0, attempt - 1);
  return Math.min(base, 60_000);
}

class OpsJobManager {
  static isInfraAction(action) {
    return INFRA_ACTIONS.has(action);
  }

  static async enqueue({ action, technical_info_id = null, payload = {} }, db) {
    const result = await db.query(EnqueueOpsJob, [
      action,
      technical_info_id,
      JSON.stringify(payload || {}),
    ]);
    return { success: true, job: result.rows[0] };
  }

  static async claimNext(lockedBy, db) {
    const result = await db.query(ClaimOpsJob, [lockedBy]);
    return result.rows[0] || null;
  }

  static async markInFlight(jobId, lockedBy, db) {
    const result = await db.query(MarkOpsJobInFlight, [jobId, lockedBy || null]);
    return result.rows[0] || null;
  }

  static async markSucceeded(jobId, db) {
    const result = await db.query(MarkOpsJobSucceeded, [jobId]);
    return result.rows[0] || null;
  }

  static async markFailed(jobId, errorMessage, attempts, db) {
    const delay = backoffMs(attempts);
    const result = await db.query(MarkOpsJobFailed, [
      jobId,
      String(errorMessage || 'error').slice(0, 1000),
      String(delay),
    ]);
    const job = result.rows[0] || null;
    if (job?.status === 'dead') {
      captureOpsError(new Error(job.last_error || 'ops job dead'), {
        job_id: job.id,
        action: job.action,
        technical_info_id: job.technical_info_id,
        attempts: job.attempts,
      });
    }
    return job;
  }

  static async retry(jobId, db) {
    const result = await db.query(RetryOpsJob, [jobId]);
    return { success: Boolean(result.rows[0]), job: result.rows[0] || null };
  }

  static async list({ status = null, action = null, q = null, limit = 50, offset = 0 }, db) {
    const statusParam = status && status !== 'all' ? status : null;
    const actionParam = action && action !== 'all' ? action : null;
    const qParam = q || null;
    const [rows, count] = await Promise.all([
      db.query(ListOpsJobs, [statusParam, actionParam, qParam, limit, offset]),
      db.query(CountOpsJobs, [statusParam, actionParam, qParam]),
    ]);
    return {
      success: true,
      jobs: rows.rows,
      total: count.rows[0]?.total || 0,
    };
  }

  static async getById(jobId, db) {
    const result = await db.query(GetOpsJobById, [jobId]);
    return { success: true, job: result.rows[0] || null };
  }
}

module.exports = OpsJobManager;
