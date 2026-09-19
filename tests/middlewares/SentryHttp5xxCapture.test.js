jest.mock('../../instrument-sentry', () => ({
  withScope: (fn) => fn({ setTag: jest.fn(), setContext: jest.fn(), setUser: jest.fn() }),
  captureMessage: jest.fn(),
}));

const Sentry = require('../../instrument-sentry');
const { sentryHttp5xxCapture } = require('../../middlewares/SentryHttp5xxCapture');
const { createMockReq, createMockRes, createMockNext } = require('../helpers/mockReqRes');

describe('SentryHttp5xxCapture', () => {
  const prevDsn = process.env.SENTRY_DSN;

  afterEach(() => {
    process.env.SENTRY_DSN = prevDsn;
    Sentry.captureMessage.mockClear();
  });

  it('logs 500 even when SENTRY_DSN empty (no Sentry call)', () => {
    process.env.SENTRY_DSN = '';
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const req = createMockReq({ method: 'GET', originalUrl: '/api/billing/x' });
    const res = createMockRes();
    const next = createMockNext();
    sentryHttp5xxCapture(req, res, next);
    res.statusCode = 500;
    res.send(JSON.stringify({ error: 'fail' }));
    expect(errSpy).toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('captures message on 500 response when DSN set', () => {
    process.env.SENTRY_DSN = 'https://example@sentry.io/1';
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    sentryHttp5xxCapture(req, res, next);
    res.statusCode = 500;
    res.send(JSON.stringify({ error: 'fail' }));
    expect(Sentry.captureMessage).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('logs 4xx API errors with body (non-webhook)', () => {
    process.env.SENTRY_DSN = '';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const req = createMockReq({ method: 'GET', originalUrl: '/api/billing/links' });
    const res = createMockRes();
    const next = createMockNext();
    sentryHttp5xxCapture(req, res, next);
    res.statusCode = 409;
    res.send(JSON.stringify({ error: 'SUBDOMAIN_TAKEN' }));
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain('SUBDOMAIN_TAKEN');
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
