const { logAction } = require('../utils/RequestTrace');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const WRITE_GET_PATHS = new Set([
  '/api/twofa',
  '/twofa',
  '/api/verification',
  '/verification',
  '/api/billing/portal',
  '/api/portal',
  '/api/billing/links',
  '/api/links',
]);

function requestPath(req) {
  const raw = (req.originalUrl || req.url || req.path || '').split('?')[0];
  if (!raw) return '/';
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
}

function allowedOrigins() {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function requestOrigin(req) {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch (_) {
    return null;
  }
}

function contentType(req) {
  const raw = req.get('content-type') || '';
  return raw.split(';')[0].trim().toLowerCase();
}

function isWebhookPath(pathname) {
  return pathname === '/webhooks' || pathname.startsWith('/webhooks/');
}

function isTwoFaDisable(pathname) {
  return pathname === '/api/twofa/disable' || pathname === '/twofa/disable';
}

function hasWriteGetHeader(req) {
  const requestedWith = (req.get('x-requested-with') || '').toLowerCase();
  if (requestedWith === 'xmlhttprequest') return true;
  const raw = req.get('content-type') || '';
  return raw.toLowerCase().startsWith('application/json');
}

function isAllowedContentType(req, pathname) {
  const type = contentType(req);
  if (type === 'application/json') return true;
  if (req.method === 'POST' && isTwoFaDisable(pathname) && type === 'multipart/form-data') {
    return true;
  }
  return false;
}

function VerifyCsrfOrigin(req, res, next) {
  const method = (req.method || '').toUpperCase();
  if (method === 'OPTIONS') {
    return next();
  }

  const pathname = requestPath(req);

  if (isWebhookPath(pathname)) {
    return next();
  }

  if (MUTATING_METHODS.has(method)) {
    const origin = requestOrigin(req);
    if (!origin || !allowedOrigins().includes(origin)) {
      logAction(req, 'warning', 'VerifyCsrfOrigin', 'rejected');
      return res.status(403).json({ error: 'CSRF validation failed' });
    }
    if (!isAllowedContentType(req, pathname)) {
      logAction(req, 'warning', 'VerifyCsrfOrigin', 'unsupported media type');
      return res.status(415).json({ error: 'Unsupported Media Type' });
    }
    return next();
  }

  if (method === 'GET' && WRITE_GET_PATHS.has(pathname)) {
    if (!hasWriteGetHeader(req)) {
      logAction(req, 'warning', 'VerifyCsrfOrigin', 'rejected');
      return res.status(403).json({ error: 'CSRF validation failed' });
    }
  }

  return next();
}

module.exports = VerifyCsrfOrigin;
module.exports.requestPath = requestPath;
module.exports.requestOrigin = requestOrigin;
module.exports.allowedOrigins = allowedOrigins;
