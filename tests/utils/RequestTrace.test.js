const {
  requestTraceMiddleware,
  addRequestTraceStep,
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
});
