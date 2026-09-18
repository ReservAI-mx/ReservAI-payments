'use strict';

jest.mock('../../utils/CreatePasswordsClient', () => ({
  encrypt: jest.fn(async (plain) => `enc:${plain}`),
  decrypt: jest.fn(async (blob) => {
    if (String(blob).startsWith('enc:')) return String(blob).slice(4);
    throw new Error('bad blob');
  }),
}));

const {
  buildEncryptedSetup,
  loadOrgConstants,
} = require('../../utils/SetupBlobBuilder');
const { decrypt } = require('../../utils/CreatePasswordsClient');

const CANON = '+5213321540248';

describe('SetupBlobBuilder', () => {
  it('pipeline_test_phone en plaintext es canónico +521… y trae REQUIRED_FIELDS de org', async () => {
    const { payload, blob } = await buildEncryptedSetup({
      subdomain: 'acme',
      client_email: 'cliente@acme.com',
      chatwoot_client_name: 'Acme',
      pipeline_test_phone: CANON,
      inboundPlain: 'inbound-plain',
      openai_api_key: 'sk-per-tenant-test',
      secrets: {
        chatwoot_client_password: 'ClientPass1!',
        chatwoot_super_admin_password: 'SuperAdmin1!',
        chatwoot_crm_admin_password: 'CrmAdmin1!',
        minio_root_password: 'MinioRoot1!',
      },
    });
    expect(payload.pipeline_test_phone).toBe(CANON);
    expect(payload.ssl_email).toBeTruthy();
    expect(payload.openai_api_key).toBe('sk-per-tenant-test');
    expect(payload.google_client_id).toBeTruthy();
    expect(payload.oauth_client_secret).toBeTruthy();
    expect(payload.chatwoot_client_email).toBe('cliente@acme.com');
    expect(payload.chatwoot_client_email).toBe(payload.client_email);
    expect(payload.chatwoot_account_name).toBe('ReservAI');
    expect(payload.chatwoot_client_role).toBe('administrator');
    expect(payload.admin_email).toBeTruthy();
    expect(payload.whatsapp_app_id).toBe('wa-app-test');
    expect(payload.whatsapp_api_version).toBe('v22.0');
    const plain = JSON.parse(await decrypt(blob));
    expect(plain.pipeline_test_phone).toBe(CANON);
    expect(plain.pipeline_test_phone).toMatch(/^\+521[1-9]\d{9}$/);
    expect(plain.domain_name).toBe('acme.reservai.com.mx');
    expect(plain.minio_root_user).toBe('root');
  });

  it('ignora chatwoot_client_email en RESERVAI_SETUP_CONSTANTS y usa client_email', async () => {
    const prev = process.env.RESERVAI_SETUP_CONSTANTS;
    process.env.RESERVAI_SETUP_CONSTANTS = JSON.stringify({
      ...JSON.parse(prev),
      chatwoot_client_email: 'no-usar@org.com',
    });
    try {
      const { payload } = await buildEncryptedSetup({
        subdomain: 'acme',
        client_email: 'cliente@acme.com',
        chatwoot_client_name: 'Acme',
        pipeline_test_phone: CANON,
        inboundPlain: 'inbound-plain',
        openai_api_key: 'sk-per-tenant-test',
        secrets: {
          chatwoot_client_password: 'ClientPass1!',
          chatwoot_super_admin_password: 'SuperAdmin1!',
          chatwoot_crm_admin_password: 'CrmAdmin1!',
          minio_root_password: 'MinioRoot1!',
        },
      });
      expect(payload.chatwoot_client_email).toBe('cliente@acme.com');
      expect(loadOrgConstants().chatwoot_client_email).toBeUndefined();
    } finally {
      process.env.RESERVAI_SETUP_CONSTANTS = prev;
    }
  });

  it('falla si falta una clave de org requerida', () => {
    const prev = process.env.RESERVAI_SETUP_CONSTANTS;
    const broken = JSON.parse(prev);
    delete broken.oauth_client_secret;
    process.env.RESERVAI_SETUP_CONSTANTS = JSON.stringify(broken);
    try {
      expect(() => loadOrgConstants()).toThrow(/SETUP_CONSTANTS_INCOMPLETE|oauth_client_secret/);
    } finally {
      process.env.RESERVAI_SETUP_CONSTANTS = prev;
    }
  });
});
