module.exports = `
  UPDATE ops_jobs
     SET status = 'succeeded',
         last_error = NULL,
         locked_at = NULL,
         locked_by = NULL,
         finished_at = now(),
         updated_at = now()
   WHERE id = $1
  RETURNING *
`;
