const OpsJobManager = require('../../utils/OpsJobManager');
const { captureOpsError } = require('../../utils/captureOpsError');

describe('OpsJobManager.markFailed', () => {
  it('calls markFailed query and returns dead job', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'j1', status: 'dead', last_error: 'x', attempts: 5, action: 'provision' }],
      }),
    };
    const job = await OpsJobManager.markFailed('j1', 'x', 5, db);
    expect(job.status).toBe('dead');
    expect(db.query).toHaveBeenCalled();
  });

  it('isInfraAction recognizes provision actions', () => {
    expect(OpsJobManager.isInfraAction('provision')).toBe(true);
    expect(OpsJobManager.isInfraAction('payment_notify')).toBe(false);
  });
});

describe('captureOpsError', () => {
  it('returns Error instance', () => {
    const err = captureOpsError('boom', { job_id: 'j1' });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
  });
});
