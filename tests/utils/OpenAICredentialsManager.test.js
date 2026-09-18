'use strict';

const { ensureCredentials } = require('../../utils/OpenAICredentialsManager');

describe('OpenAICredentialsManager', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENAI_ADMIN_KEY = 'sk-admin-test';
    process.env.OPENAI_PROJECT_ID = 'proj_test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('crea Service Account y devuelve api key', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'svc_acct_1',
        api_key: { id: 'key_1', value: 'sk-new' },
      }),
    }));

    const out = await ensureCredentials({ subdomain: 'Acme' });
    expect(out).toEqual({
      serviceAccountId: 'svc_acct_1',
      apiKeyId: 'key_1',
      apiKey: 'sk-new',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/organization/projects/proj_test/service_accounts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'client-acme' }),
      })
    );
  });

  it('reusa SA y crea api key nueva', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'key_2', value: 'sk-rotated' }),
    }));

    const out = await ensureCredentials({
      subdomain: 'acme',
      serviceAccountId: 'svc_acct_1',
    });
    expect(out).toEqual({
      serviceAccountId: 'svc_acct_1',
      apiKeyId: 'key_2',
      apiKey: 'sk-rotated',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/organization/projects/proj_test/service_accounts/svc_acct_1/api_keys',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('falla si falta OPENAI_ADMIN_KEY', async () => {
    delete process.env.OPENAI_ADMIN_KEY;
    await expect(ensureCredentials({ subdomain: 'acme' })).rejects.toMatchObject({
      code: 'OPENAI_ADMIN_KEY_MISSING',
    });
  });
});
