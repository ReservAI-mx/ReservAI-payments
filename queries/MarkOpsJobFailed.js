module.exports = `
  UPDATE ops_jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'failed' END,
         last_error = $2,
         next_attempt_at = CASE
           WHEN attempts >= max_attempts THEN next_attempt_at
           ELSE now() + ($3::text || ' milliseconds')::interval
         END,
         locked_at = NULL,
         locked_by = NULL,
         finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = $1
  RETURNING *
`;
