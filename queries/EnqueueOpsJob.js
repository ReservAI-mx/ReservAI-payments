module.exports = `
  INSERT INTO ops_jobs (action, technical_info_id, payload, status, next_attempt_at)
  VALUES ($1, $2, $3::jsonb, 'queued', now())
  RETURNING *
`;
