const VerifyProxySecret = require('../../middlewares/VerifyProxySecret');
const { createMockReq, createMockRes, createMockNext } = require('../helpers/mockReqRes');

describe('VerifyProxySecret', () => {
  it('bypasses in NODE_ENV=test and sets proxyVerified', () => {
    const req = createMockReq();
    const next = createMockNext();
    VerifyProxySecret(req, createMockRes(), next);
    expect(req.proxyVerified).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('skips /webhooks/stripe even when secret is configured', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.PROXY_SECRET_HEADER;
    process.env.NODE_ENV = 'development';
    process.env.PROXY_SECRET_HEADER = 'expected-secret';
    global.IS_PRODUCTION = false;
    try {
      const req = createMockReq({ originalUrl: '/webhooks/stripe', path: '/stripe' });
      const next = createMockNext();
      VerifyProxySecret(req, createMockRes(), next);
      expect(next).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.PROXY_SECRET_HEADER;
      else process.env.PROXY_SECRET_HEADER = prevSecret;
    }
  });

  it('timingSafeEqualString compares secrets', () => {
    expect(VerifyProxySecret.timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(VerifyProxySecret.timingSafeEqualString('abc', 'abd')).toBe(false);
  });

  it('rejects missing secret in production when configured', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.PROXY_SECRET_HEADER;
    process.env.NODE_ENV = 'production';
    process.env.PROXY_SECRET_HEADER = 'expected-secret';
    global.IS_PRODUCTION = true;
    try {
      const req = createMockReq({ originalUrl: '/api/customer', path: '/customer' });
      const res = createMockRes();
      const next = createMockNext();
      VerifyProxySecret(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.PROXY_SECRET_HEADER;
      else process.env.PROXY_SECRET_HEADER = prevSecret;
      global.IS_PRODUCTION = false;
    }
  });

  it('accepts valid secret in production', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.PROXY_SECRET_HEADER;
    const prevHeaderName = process.env.PROXY_SECRET_HEADER_NAME;
    process.env.NODE_ENV = 'production';
    process.env.PROXY_SECRET_HEADER = 'expected-secret';
    delete process.env.PROXY_SECRET_HEADER_NAME;
    global.IS_PRODUCTION = true;
    try {
      const header = VerifyProxySecret.headerName();
      const req = createMockReq({
        originalUrl: '/api/customer',
        path: '/customer',
        headers: { [header]: 'expected-secret' },
      });
      const next = createMockNext();
      VerifyProxySecret(req, createMockRes(), next);
      expect(req.proxyVerified).toBe(true);
      expect(next).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.PROXY_SECRET_HEADER;
      else process.env.PROXY_SECRET_HEADER = prevSecret;
      if (prevHeaderName === undefined) delete process.env.PROXY_SECRET_HEADER_NAME;
      else process.env.PROXY_SECRET_HEADER_NAME = prevHeaderName;
      global.IS_PRODUCTION = false;
    }
  });
});
