const { isTransientDbError } = require('../../data/connectDB');

describe('isTransientDbError', () => {
  it('detects ETIMEDOUT by code and message', () => {
    expect(isTransientDbError({ code: 'ETIMEDOUT', message: 'read ETIMEDOUT' })).toBe(true);
    expect(isTransientDbError(new Error('read ETIMEDOUT'))).toBe(true);
  });

  it('detects Connection terminated unexpectedly', () => {
    expect(isTransientDbError(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(isTransientDbError({ code: 'ECONNRESET', message: 'socket hang up' })).toBe(true);
  });

  it('rejects unrelated errors', () => {
    expect(isTransientDbError(new Error('syntax error at or near'))).toBe(false);
    expect(isTransientDbError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });
});
