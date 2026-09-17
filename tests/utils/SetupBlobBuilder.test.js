'use strict';

const { buildEncryptedSetup } = require('../../utils/SetupBlobBuilder');
const VaultCrypto = require('../../utils/VaultCrypto');

const CANON = '+5213321540248';

describe('SetupBlobBuilder', () => {
  it('pipeline_test_phone en plaintext es canónico +521… y trae REQUIRED_FIELDS de org', () => {
    const { payload, blob } = buildEncryptedSetup({
      subdomain: 'acme',
      client_email: 'cliente@acme.com',
      chatwoot_client_name: 'Acme',
      pipeline_test_phone: CANON,
      inboundPlain: 'inbound-plain',
      secrets: {
        chatwoot_client_password: 'ClientPass1!',
        chatwoot_super_admin_password: 'SuperAdmin1!',
        chatwoot_crm_admin_password: 'CrmAdmin1!',
        minio_root_password: 'MinioRoot1!',
      },
    });
    expect(payload.pipeline_test_phone).toBe(CANON);
    expect(payload.ssl_email).toBeTruthy();
    expect(payload.openai_api_key).toBeTruthy();
    expect(payload.google_client_id).toBeTruthy();
    expect(payload.oauth_client_secret).toBeTruthy();
    const plain = JSON.parse(VaultCrypto.decrypt(blob));
    expect(plain.pipeline_test_phone).toBe(CANON);
    expect(plain.pipeline_test_phone).toMatch(/^\+521[1-9]\d{9}$/);
    expect(plain.domain_name).toBe('acme.reservai.com.mx');
    expect(plain.minio_root_user).toBe('root');
  });
});
