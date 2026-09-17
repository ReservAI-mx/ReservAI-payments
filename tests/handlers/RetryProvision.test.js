jest.mock('../../data/connectDB');
jest.mock('../../utils/TechnicalInfoManager');
jest.mock('../../utils/ProvisionFanout');
jest.mock('../../utils/SetupProvisionManager');

const { connectDB } = require('../../data/connectDB');
const TechnicalInfoManager = require('../../utils/TechnicalInfoManager');
const ProvisionFanout = require('../../utils/ProvisionFanout');
const SetupProvisionManager = require('../../utils/SetupProvisionManager');
const RetryProvision = require('../../handlers/RetryProvision');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('RetryProvision', () => {
  const db = {};

  beforeEach(() => {
    jest.clearAllMocks();
    connectDB.mockResolvedValue(db);
    ProvisionFanout.notify.mockResolvedValue({ success: true });
  });

  it('409 sin provision_error', async () => {
    const req = createMockReq({
      technical_info: { id: 'ti-1', status: 'pending_provision', provision_error: null },
    });
    const res = createMockRes();
    await RetryProvision(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(ProvisionFanout.notify).not.toHaveBeenCalled();
  });

  it('202 reclama y notifica si el blob ya está', async () => {
    TechnicalInfoManager.claimProvisionRetry.mockResolvedValue({ success: true, id: 'ti-1' });
    TechnicalInfoManager.getById.mockResolvedValue({
      success: true,
      tenant: {
        id: 'ti-1',
        status: 'pending_provision',
        encrypted_setup_json: '{"keyId":"v1"}',
      },
    });
    const req = createMockReq({
      technical_info: { id: 'ti-1', status: 'pending_provision', provision_error: 'dns_apex: x' },
    });
    const res = createMockRes();
    await RetryProvision(req, res);
    expect(TechnicalInfoManager.claimProvisionRetry).toHaveBeenCalledWith('ti-1', db);
    expect(SetupProvisionManager.ensureEncryptedSetup).not.toHaveBeenCalled();
    expect(ProvisionFanout.notify).toHaveBeenCalledWith('ti-1', 'provision', db);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('sin blob reanuda secretos antes de fanout', async () => {
    TechnicalInfoManager.claimProvisionRetry.mockResolvedValue({ success: true, id: 'ti-1' });
    TechnicalInfoManager.getById.mockResolvedValue({
      success: true,
      tenant: { id: 'ti-1', status: 'pending_provision', encrypted_setup_json: null },
    });
    SetupProvisionManager.ensureEncryptedSetup.mockResolvedValue({
      success: true,
      tenant: { id: 'ti-1', encrypted_setup_json: '{"keyId":"v1"}' },
    });
    const req = createMockReq({
      technical_info: { id: 'ti-1', status: 'pending_provision', provision_error: 'create_passwords' },
    });
    const res = createMockRes();
    await RetryProvision(req, res);
    expect(SetupProvisionManager.ensureEncryptedSetup).toHaveBeenCalled();
    expect(ProvisionFanout.notify).toHaveBeenCalledWith('ti-1', 'provision', db);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('sin blob y gRPC fail no fanout', async () => {
    TechnicalInfoManager.claimProvisionRetry.mockResolvedValue({ success: true, id: 'ti-1' });
    TechnicalInfoManager.getById.mockResolvedValue({
      success: true,
      tenant: { id: 'ti-1', status: 'pending_provision', encrypted_setup_json: null },
    });
    SetupProvisionManager.ensureEncryptedSetup.mockResolvedValue({
      success: false,
      error: 'create_passwords',
    });
    const req = createMockReq({
      technical_info: { id: 'ti-1', status: 'pending_provision', provision_error: 'create_passwords' },
    });
    const res = createMockRes();
    await RetryProvision(req, res);
    expect(ProvisionFanout.notify).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('409 si claim vacío (segundo click)', async () => {
    TechnicalInfoManager.claimProvisionRetry.mockResolvedValue({ success: true, id: null });
    const req = createMockReq({
      technical_info: { id: 'ti-1', status: 'pending_provision', provision_error: 'dns_apex: x' },
    });
    const res = createMockRes();
    await RetryProvision(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(ProvisionFanout.notify).not.toHaveBeenCalled();
  });
});
