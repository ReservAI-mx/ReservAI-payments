const {
  requestTraceMiddleware,
  addRequestTraceStep,
  buildSentryFlowContext,
} = require('../../utils/RequestTrace');
const { createMockReq, createMockRes, createMockNext } = require('../helpers/mockReqRes');

describe('RequestTrace', () => {
  it('requestTraceMiddleware initializes trace and logs', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const req = createMockReq({ method: 'GET', originalUrl: '/api/billing/health' });
    const next = createMockNext();
    const res = createMockRes();
    requestTraceMiddleware(req, res, next);
    expect(req.passRequestTrace.startedAt).toBeDefined();
    expect(Array.isArray(req.passRequestTrace.steps)).toBe(true);
    expect(next).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    expect(String(logSpy.mock.calls[0][0])).toContain('[stripe][http] → GET /api/billing/health');
    res.statusCode = 200;
    res.emit('finish');
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('←'))).toBe(true);
    logSpy.mockRestore();
  });

  it('addRequestTraceStep redacts sensitive keys', () => {
    const req = createMockReq();
    addRequestTraceStep(req, 'TestStep', { password: 'secret', ok: true });
    const step = req.passRequestTrace.steps[0];
    expect(step.password).toBeUndefined();
    expect(step.ok).toBe(true);
  });

  it('buildSentryFlowContext includes actor and route', () => {
    const req = createMockReq({ method: 'GET', originalUrl: '/api/status?q=1' });
    req.account = { id: 'a1', type: 'client', verified: true };
    req.token_type = 'access';
    addRequestTraceStep(req, 'VerifyToken', { auth: 'jwt_cookie' });
    const ctx = buildSentryFlowContext(req);
    expect(ctx.actor.account_id).toBe('a1');
    expect(ctx.route.method).toBe('GET');
    expect(ctx.middleware_flow.length).toBeGreaterThan(0);
  });
});
