const AccountIsAdmin = require('../../middlewares/AccountIsAdmin');
const Account = require('../../models/account');
const { createMockReq, createMockRes, createMockNext } = require('../helpers/mockReqRes');

describe('AccountIsAdmin', () => {
  it('allows admin accounts', async () => {
    const req = createMockReq();
    req.account = new Account('id', 'n', 'e', 'p', new Date(), true, true, 'admin', false, 'salt');
    const next = createMockNext();
    await AccountIsAdmin(req, createMockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects client accounts', async () => {
    const req = createMockReq();
    req.account = new Account('id', 'n', 'e', 'p', new Date(), true, true, 'client', false, 'salt');
    const res = createMockRes();
    const next = createMockNext();
    await AccountIsAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
