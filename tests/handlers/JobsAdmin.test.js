jest.mock('../../data/connectDB');
jest.mock('../../utils/OpsJobManager');

const { connectDB } = require('../../data/connectDB');
const OpsJobManager = require('../../utils/OpsJobManager');
const ListJobs = require('../../handlers/ListJobs');
const RetryJob = require('../../handlers/RetryJob');
const { createMockReq, createMockRes } = require('../helpers/mockReqRes');

describe('Jobs admin handlers', () => {
  const db = {};

  beforeEach(() => {
    jest.clearAllMocks();
    connectDB.mockResolvedValue(db);
  });

  it('ListJobs returns jobs', async () => {
    OpsJobManager.list.mockResolvedValue({
      success: true,
      jobs: [{ id: 'j1', status: 'failed' }],
      total: 1,
    });
    const res = createMockRes();
    await ListJobs(createMockReq({ query: { status: 'failed', page: '1', search: '' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res._json.total).toBe(1);
    expect(res._json.current_page).toBe(1);
    expect(OpsJobManager.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', q: null, offset: 0 }),
      db
    );
  });

  it('RetryJob requeues failed', async () => {
    OpsJobManager.getById.mockResolvedValue({
      success: true,
      job: { id: 'j1', status: 'failed' },
    });
    OpsJobManager.retry.mockResolvedValue({
      success: true,
      job: { id: 'j1', status: 'queued' },
    });
    const res = createMockRes();
    await RetryJob(createMockReq({ params: { id: 'j1' } }), res);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res._json.accepted).toBe(true);
  });

  it('RetryJob rejects succeeded', async () => {
    OpsJobManager.getById.mockResolvedValue({
      success: true,
      job: { id: 'j1', status: 'succeeded' },
    });
    const res = createMockRes();
    await RetryJob(createMockReq({ params: { id: 'j1' } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
