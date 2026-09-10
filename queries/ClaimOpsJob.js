module.exports = `
  WITH stale AS (
    UPDATE ops_jobs
       SET status = 'failed',
           last_error = COALESCE(last_error, 'stale in_flight'),
           next_attempt_at = now(),
           locked_at = NULL,
           locked_by = NULL,
           updated_at = now()
     WHERE status = 'in_flight'
       AND locked_at IS NOT NULL
       AND locked_at < now() - interval '15 minutes'
  ),
  claim AS (
    SELECT id
      FROM ops_jobs
     WHERE status IN ('queued', 'failed')
       AND attempts < max_attempts
       AND next_attempt_at <= now()
     ORDER BY next_attempt_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  UPDATE ops_jobs j
     SET attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = $1,
         updated_at = now()
    FROM claim
   WHERE j.id = claim.id
  RETURNING j.*
`;
