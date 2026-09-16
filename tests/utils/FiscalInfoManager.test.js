const FiscalInfoManager = require('../../utils/FiscalInfoManager');

describe('FiscalInfoManager', () => {
  test('validateUpsertInput requires disclaimer', () => {
    const r = FiscalInfoManager.validateUpsertInput({
      rfc: 'XAXX010101000',
      razon_social: 'ACME SA',
      codigo_postal: '01000',
      regimen_fiscal: '601',
      persona_moral: true,
    });
    expect(r.error).toBe('DISCLAIMER_REQUIRED');
  });

  test('validateUpsertInput accepts valid payload with confirmed', () => {
    const r = FiscalInfoManager.validateUpsertInput({
      confirmed: true,
      rfc: 'XAXX010101000',
      razon_social: 'ACME SA',
      codigo_postal: '01000',
      regimen_fiscal: '601',
      persona_moral: true,
      uso_cfdi: 'G03',
    });
    expect(r.error).toBeUndefined();
    expect(r.rfc).toBe('XAXX010101000');
    expect(r.persona_moral).toBe(true);
    expect(r.uso_cfdi).toBe('G03');
  });

  test('resolvePriceVariant uses moral only when active+valid+moral', async () => {
    const db = {
      query: jest.fn(async () => ({
        rows: [{
          id: 'f1',
          account_id: 'a1',
          active: true,
          persona_moral: true,
          sat_validation_status: 'valid',
        }],
      })),
    };
    const r = await FiscalInfoManager.resolvePriceVariant(
      '11111111-1111-1111-1111-111111111111',
      db
    );
    expect(r.success).toBe(true);
    expect(r.variant).toBe('moral');
  });

  test('resolvePriceVariant falls back to full otherwise', async () => {
    const db = {
      query: jest.fn(async () => ({
        rows: [{
          id: 'f1',
          active: true,
          persona_moral: true,
          sat_validation_status: 'pending',
        }],
      })),
    };
    const r = await FiscalInfoManager.resolvePriceVariant(
      '11111111-1111-1111-1111-111111111111',
      db
    );
    expect(r.variant).toBe('full');
  });

  test('pickSetupPriceId chooses moral price', () => {
    const product = {
      stripe_price_id_setup: 'ps',
      stripe_price_id_setup_moral: 'psm',
    };
    expect(FiscalInfoManager.pickSetupPriceId(product, 'moral')).toBe('psm');
    expect(FiscalInfoManager.pickSetupPriceId(product, 'full')).toBe('ps');
  });
});
