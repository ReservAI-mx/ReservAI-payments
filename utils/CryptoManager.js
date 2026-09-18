const crypto = require('crypto');

const HMAC_ALGORITHM = 'sha256';

class CryptoManager {
  static createHMAC(data, secret) {
    const hmac = crypto.createHmac(HMAC_ALGORITHM, secret);
    hmac.update(data);
    return `${HMAC_ALGORITHM}=${hmac.digest('hex')}`;
  }

  static verifyHMAC(data, signature, secret) {
    if (!signature || !secret) return false;
    const expected = this.createHMAC(data, secret);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
      crypto.timingSafeEqual(a, a);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }
}

module.exports = CryptoManager;
