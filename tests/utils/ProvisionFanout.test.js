/**
 * @jest-environment node
 */
jest.mock('../../utils/OpsJobManager');
jest.mock('../../data/connectDB');

const OpsJobManager = require('../../utils/OpsJobManager');
const { connectDB } = require('../../data/connectDB');
const ProvisionFanout = require('../../utils/ProvisionFanout');

describe('ProvisionFanout', () => {
  const originalFetch = global.fetch;
  const db = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  beforeEach(() => {
    process.env.PROVISION_SECRET_KEY = 'test-secret';
    process.env.PROVISION_WORKER_URL = 'http://provision:3003/jobs';
    global.fetch = jest.fn();
    connectDB.mockResolvedValue(db);
    OpsJobManager.enqueue.mockResolvedValue({
      success: true,
      job: { id: '11111111-1111-4111-8111-111111111111' },
    });
    OpsJobManager.markInFlight.mockResolvedValue({});
    OpsJobManager.markFailed.mockResolvedValue({ status: 'failed' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('retries until 202 and marks in_flight', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 202 });
    const result = await ProvisionFanout.notify(
      '00000000-0000-4000-8000-000000000001',
      'provision',
      db
    );
    expect(result.success).toBe(true);
    expect(result.job_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['X-Provision-Signature']).toMatch(/^sha256=/);
    expect(JSON.parse(opts.body).job_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(OpsJobManager.markInFlight).toHaveBeenCalled();
  });

  it('skips without id', async () => {
    const result = await ProvisionFanout.notify(null, 'provision', db);
    expect(result.skipped).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
