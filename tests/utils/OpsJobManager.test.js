const {
  captureOpsError,
  captureStripeFailure,
} = require('../../utils/captureOpsError');
const OpsJobManager = require('../../utils/OpsJobManager');

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
  let errSpy;

  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('returns Error instance and logs to console', () => {
    const err = captureOpsError('boom', { job_id: 'j1', phase: 'ops.test' });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0][0])).toContain('[stripe][ops.test]');
    expect(String(errSpy.mock.calls[0][0])).toContain('boom');
  });

  it('captureStripeFailure tags webhook area and phase', () => {
    captureStripeFailure('insert failed', {
      area: 'webhook',
      phase: 'webhook.checkout.insert',
      event_type: 'checkout.session.completed',
    });
    expect(errSpy).toHaveBeenCalled();
  });
});
