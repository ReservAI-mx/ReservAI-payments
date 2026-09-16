const FiscalInfoManager = require('../../utils/FiscalInfoManager');
const FacturamaClient = require('../../utils/FacturamaClient');

jest.mock('../../utils/FacturamaClient');

describe('FiscalInfoManager', () => {
  beforeEach(() => {
    FacturamaClient.validateReceiver.mockReset();
  });

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
      razon_social: '  acme sa  ',
      codigo_postal: ' 01000 ',
      regimen_fiscal: '601',
      persona_moral: true,
      uso_cfdi: 'G03',
    });
    expect(r.error).toBeUndefined();
    expect(r.rfc).toBe('XAXX010101000');
    expect(r.razon_social).toBe('ACME SA');
    expect(r.codigo_postal).toBe('01000');
    expect(r.persona_moral).toBe(true);
    expect(r.uso_cfdi).toBe('G03');
  });

  test('validateUpsertInput rejects regimen incompatible with persona', () => {
    const r = FiscalInfoManager.validateUpsertInput({
      confirmed: true,
      rfc: 'XAXX010101000',
      razon_social: 'ACME SA',
      codigo_postal: '01000',
      regimen_fiscal: '601',
      persona_moral: false,
    });
    expect(r.error).toBe('regimen_fiscal no válido para persona física');
  });

  test('interpretSatValidation valid when all flags true', () => {
    const r = FiscalInfoManager.interpretSatValidation({
      success: true,
      data: {
        ExistRfc: true,
        MatchName: true,
        MatchZipCode: true,
        MatchFiscalRegime: true,
      },
    });
    expect(r.status).toBe('valid');
  });

  test('interpretSatValidation invalid when MatchName false', () => {
    const r = FiscalInfoManager.interpretSatValidation({
      success: true,
      data: {
        ExistRfc: true,
        MatchName: false,
        MatchZipCode: true,
        MatchFiscalRegime: true,
      },
    });
    expect(r.status).toBe('invalid');
    expect(r.detail).toContain('MatchName');
  });

  test('interpretSatValidation error on Facturama failure', () => {
    const r = FiscalInfoManager.interpretSatValidation({
      success: false,
      error: 'timeout',
    });
    expect(r.status).toBe('error');
  });

  test('refreshSatValidation persists Facturama result', async () => {
    FacturamaClient.validateReceiver.mockResolvedValue({
      success: true,
      data: {
        ExistRfc: true,
        MatchName: true,
        MatchZipCode: true,
        MatchFiscalRegime: true,
      },
    });
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'f1',
              rfc: 'EKU9003173C9',
              razon_social: 'ESCUELA KEMPER URGATE',
              codigo_postal: '26015',
              regimen_fiscal: '601',
              sat_validation_status: 'pending',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'f1', sat_validation_status: 'valid' }],
        }),
    };
    const r = await FiscalInfoManager.refreshSatValidation('a1', db);
    expect(r.success).toBe(true);
    expect(r.sat_status).toBe('valid');
    expect(FacturamaClient.validateReceiver).toHaveBeenCalled();
  });

  test('maybeRelaxSandboxSat accepts real RFC when Facturama sandbox returns ExistRfc false', () => {
    delete process.env.FACTURAMA_SAT_VALIDATE_STRICT;
    FacturamaClient.isSandbox = jest.fn(() => true);

    const sat = FiscalInfoManager.maybeRelaxSandboxSat(
      {
        status: 'invalid',
        detail: JSON.stringify({
          ExistRfc: false,
          MatchName: false,
          MatchZipCode: false,
          MatchFiscalRegime: false,
        }),
      },
      {
        success: true,
        data: {
          ExistRfc: false,
          MatchName: false,
          MatchZipCode: false,
          MatchFiscalRegime: false,
        },
      }
    );
    expect(sat.status).toBe('valid');
    expect(JSON.parse(sat.detail).sandbox_relaxed).toBe(true);
    expect(FacturamaClient.isSandbox).toHaveBeenCalled();
  });

  test('describeSatValidation maps SAT mismatch flags', () => {
    const r = FiscalInfoManager.describeSatValidation({
      status: 'invalid',
      detail: JSON.stringify({
        ExistRfc: true,
        MatchName: false,
        MatchZipCode: true,
        MatchFiscalRegime: true,
      }),
    });
    expect(r.status).toBe('invalid');
    expect(r.messages.some((m) => m.includes('razón social'))).toBe(true);
  });

  test('upsert validates with Facturama before persisting', async () => {
    FacturamaClient.validateReceiver.mockResolvedValue({
      success: true,
      data: {
        ExistRfc: true,
        MatchName: true,
        MatchZipCode: true,
        MatchFiscalRegime: true,
      },
    });
    const row = {
      id: 'f1',
      account_id: 'a1',
      rfc: 'EKU9003173C9',
      sat_validation_status: 'pending',
    };
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({
          rows: [{ ...row, sat_validation_status: 'valid' }],
        }),
    };
    const r = await FiscalInfoManager.upsert(
      'a1',
      {
        confirmed: true,
        rfc: 'EKU9003173C9',
        razon_social: 'ESCUELA KEMPER URGATE',
        codigo_postal: '26015',
        regimen_fiscal: '601',
        persona_moral: true,
      },
      {},
      db
    );
    expect(r.success).toBe(true);
    expect(FacturamaClient.validateReceiver).toHaveBeenCalledWith({
      Rfc: 'EKU9003173C9',
      Name: 'ESCUELA KEMPER URGATE',
      ZipCode: '26015',
      FiscalRegime: '601',
    });
    expect(r.fiscal.sat_validation_status).toBe('valid');
    expect(r.sat_validation.status).toBe('valid');
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  test('upsert rejects invalid SAT without writing fiscal data', async () => {
    FacturamaClient.validateReceiver.mockResolvedValue({
      success: true,
      data: {
        ExistRfc: true,
        MatchName: false,
        MatchZipCode: true,
        MatchFiscalRegime: true,
      },
    });
    const db = {
      query: jest.fn().mockResolvedValueOnce({ rows: [] }),
    };
    const r = await FiscalInfoManager.upsert(
      'a1',
      {
        confirmed: true,
        rfc: 'EKU9003173C9',
        razon_social: 'NOMBRE INCORRECTO',
        codigo_postal: '26015',
        regimen_fiscal: '601',
        persona_moral: true,
      },
      {},
      db
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe('SAT_VALIDATION_FAILED');
    expect(r.status).toBe(400);
    expect(r.sat_validation.status).toBe('invalid');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('setActive blocks when SAT not valid', async () => {
    const db = {
      query: jest.fn(async () => ({
        rows: [
          {
            id: 'f1',
            authorization_accepted: true,
            sat_validation_status: 'invalid',
          },
        ],
      })),
    };
    const r = await FiscalInfoManager.setActive('a1', true, db);
    expect(r.success).toBe(false);
    expect(r.error).toBe('SAT_VALIDATION_REQUIRED');
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
