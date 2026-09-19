jest.mock('../../instrument-sentry', () => ({
  withScope: jest.fn((cb) => {
    const scope = {
      setTag: jest.fn(),
      setContext: jest.fn(),
    };
    cb(scope);
    return scope;
  }),
  captureException: jest.fn(),
  flush: jest.fn(async () => true),
}));

const Sentry = require('../../instrument-sentry');
const {
  captureOpsError,
  captureStripeFailure,
  flushSentry,
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
    Sentry.captureException.mockClear();
    Sentry.withScope.mockClear();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('returns Error instance and logs to console', () => {
    const err = captureOpsError('boom', { job_id: 'j1', phase: 'ops.test' });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
    expect(Sentry.captureException).toHaveBeenCalled();
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
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });

  it('flushSentry calls Sentry.flush', async () => {
    await flushSentry(100);
    expect(Sentry.flush).toHaveBeenCalledWith(100);
  });
});
