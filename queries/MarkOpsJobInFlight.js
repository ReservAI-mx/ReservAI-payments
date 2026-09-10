module.exports = `
  UPDATE ops_jobs
     SET status = 'in_flight',
         locked_at = now(),
         locked_by = COALESCE($2, locked_by),
         updated_at = now(),
         last_error = NULL
   WHERE id = $1
  RETURNING *
`;
