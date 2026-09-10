jest.mock('../../utils/ProvisionFanout');
jest.mock('../../utils/PaymentFanout');
jest.mock('../../data/connectDB');
jest.mock('../../queries/GetTechnicalInfoById', () => 'SELECT tenant');

const OpsJobManager = require('../../utils/OpsJobManager');
const ProvisionFanout = require('../../utils/ProvisionFanout');
const PaymentFanout = require('../../utils/PaymentFanout');
const { getDB } = require('../../data/connectDB');
const { tick } = require('../../utils/OpsJobPoller');

describe('OpsJobPoller', () => {
  const db = {};

  beforeEach(() => {
    jest.clearAllMocks();
    getDB.mockReturnValue(db);
    jest.spyOn(OpsJobManager, 'claimNext');
    jest.spyOn(OpsJobManager, 'markInFlight').mockResolvedValue({});
    jest.spyOn(OpsJobManager, 'markFailed').mockResolvedValue({ status: 'failed' });
    jest.spyOn(OpsJobManager, 'markSucceeded').mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks in_flight after infra POST 202', async () => {
    OpsJobManager.claimNext
      .mockResolvedValueOnce({
        id: 'job-1',
        action: 'disable_renewal',
        technical_info_id: 'ti-1',
        attempts: 1,
        payload: {},
      })
      .mockResolvedValueOnce(null);
    ProvisionFanout.postJob.mockResolvedValue({ success: true });

    await tick();

    expect(ProvisionFanout.postJob).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: 'job-1', action: 'disable_renewal' })
    );
    expect(OpsJobManager.markInFlight).toHaveBeenCalled();
  });

  it('requeues on POST fail', async () => {
    OpsJobManager.claimNext
      .mockResolvedValueOnce({
        id: 'job-2',
        action: 'provision',
        technical_info_id: 'ti-1',
        attempts: 2,
        payload: {},
      })
      .mockResolvedValueOnce(null);
    ProvisionFanout.postJob.mockResolvedValue({ success: false, error: '502' });

    await tick();

    expect(OpsJobManager.markFailed).toHaveBeenCalledWith('job-2', '502', 2, db);
  });

  it('payment_notify success marks succeeded', async () => {
    OpsJobManager.claimNext
      .mockResolvedValueOnce({
        id: 'job-3',
        action: 'payment_notify',
        technical_info_id: 'ti-1',
        attempts: 1,
        payload: { status: 'ok' },
      })
      .mockResolvedValueOnce(null);
    db.query = jest.fn().mockResolvedValue({
      rows: [{ id: 'ti-1', subdomain: 'acme', inbound_auth_key: 'x' }],
    });
    PaymentFanout.deliver.mockResolvedValue({ success: true });

    await tick();

    expect(PaymentFanout.deliver).toHaveBeenCalled();
    expect(OpsJobManager.markSucceeded).toHaveBeenCalledWith('job-3', db);
  });
});
