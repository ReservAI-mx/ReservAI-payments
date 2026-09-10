module.exports = `
  UPDATE ops_jobs
     SET status = 'queued',
         next_attempt_at = now(),
         locked_at = NULL,
         locked_by = NULL,
         finished_at = NULL,
         last_error = NULL,
         updated_at = now()
   WHERE id = $1
     AND status IN ('failed', 'dead')
  RETURNING *
`;
