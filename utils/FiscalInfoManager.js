const GetFiscalByAccountId = require('../queries/GetFiscalByAccountId');
const InsertFiscalInfo = require('../queries/InsertFiscalInfo');
const UpdateFiscalInfo = require('../queries/UpdateFiscalInfo');
const SetFiscalActive = require('../queries/SetFiscalActive');
const SoftDeleteFiscalInfo = require('../queries/SoftDeleteFiscalInfo');
const HardDeleteFiscalInfo = require('../queries/HardDeleteFiscalInfo');
const CountInvoicesByFiscalId = require('../queries/CountInvoicesByFiscalId');

const TERMS_VERSION = 'fiscal-disclaimer-v1';

const DISCLAIMER_TEXT =
  'Confirmo que los datos fiscales proporcionados son correctos y que cuento con autorización para utilizarlos para la emisión de CFDI relacionados con los servicios contratados con ReservAI. Entiendo que es mi responsabilidad proporcionar información autorizada y que ReservAI no responde por el uso de un RFC ajeno o no autorizado.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
const CP_RE = /^\d{5}$/;

const REGIMENES_FISICA = new Set(['612', '626', '621', '606', '625', '605', '608']);
const REGIMENES_MORAL = new Set(['601', '626', '603', '622', '620', '623', '624']);

class FiscalInfoManager {
  static getDisclaimerMeta() {
    return {
      terms_version: TERMS_VERSION,
      disclaimer_text: DISCLAIMER_TEXT,
    };
  }

  static allowedRegimenes(personaMoral) {
    return personaMoral ? REGIMENES_MORAL : REGIMENES_FISICA;
  }

  static toPublic(row) {
    if (!row) return null;
    return {
      id: row.id,
      account_id: row.account_id,
      active: !!row.active,
      rfc: row.rfc,
      razon_social: row.razon_social,
      codigo_postal: row.codigo_postal,
      regimen_fiscal: row.regimen_fiscal,
      persona_moral: !!row.persona_moral,
      uso_cfdi: row.uso_cfdi,
      authorization_accepted: !!row.authorization_accepted,
      authorization_accepted_at: row.authorization_accepted_at,
      authorization_terms_version: row.authorization_terms_version,
      sat_validation_status: row.sat_validation_status || 'pending',
      sat_validated_at: row.sat_validated_at,
      sat_validation_detail: row.sat_validation_detail,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  static validateUpsertInput(body) {
    if (!body || body.confirmed !== true) {
      return { error: 'DISCLAIMER_REQUIRED' };
    }

    const rfc = body.rfc != null ? String(body.rfc).trim().toUpperCase() : '';
    const razon_social = body.razon_social != null ? String(body.razon_social).trim() : '';
    const codigo_postal = body.codigo_postal != null ? String(body.codigo_postal).trim() : '';
    const regimen_fiscal = body.regimen_fiscal != null ? String(body.regimen_fiscal).trim() : '';
    const uso_cfdi =
      body.uso_cfdi != null && String(body.uso_cfdi).trim()
        ? String(body.uso_cfdi).trim().toUpperCase()
        : 'G01';
    const persona_moral = body.persona_moral === true || body.persona_moral === 'true';

    if (!RFC_RE.test(rfc)) return { error: 'rfc inválido' };
    if (!razon_social || razon_social.length < 3) return { error: 'razon_social es requerida' };
    if (!CP_RE.test(codigo_postal)) return { error: 'codigo_postal inválido' };
    if (!regimen_fiscal) return { error: 'regimen_fiscal es requerido' };
    if (!FiscalInfoManager.allowedRegimenes(persona_moral).has(regimen_fiscal)) {
      return {
        error: persona_moral
          ? 'regimen_fiscal no válido para persona moral'
          : 'regimen_fiscal no válido para persona física',
      };
    }

    return {
      rfc,
      razon_social,
      codigo_postal,
      regimen_fiscal,
      persona_moral,
      uso_cfdi,
    };
  }

  static async getByAccountId(accountId, db) {
    try {
      const result = await db.query(GetFiscalByAccountId, [accountId]);
      return { success: true, fiscal: result.rows[0] || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static async upsert(accountId, body, meta, db) {
    const parsed = FiscalInfoManager.validateUpsertInput(body);
    if (parsed.error) {
      return { success: false, error: parsed.error, status: 400 };
    }

    const acceptedBy = meta?.acceptedBy != null ? String(meta.acceptedBy) : String(accountId);
    const acceptedIp = meta?.acceptedIp != null ? String(meta.acceptedIp) : 'unknown';

    try {
      const existing = await FiscalInfoManager.getByAccountId(accountId, db);
      if (!existing.success) {
        return { success: false, error: existing.error, status: 500 };
      }

      const params = [
        parsed.rfc,
        parsed.razon_social,
        parsed.codigo_postal,
        parsed.regimen_fiscal,
        parsed.persona_moral,
        parsed.uso_cfdi,
        acceptedBy,
        acceptedIp,
        TERMS_VERSION,
        DISCLAIMER_TEXT,
      ];

      let row;
      if (existing.fiscal) {
        const updated = await db.query(UpdateFiscalInfo, [existing.fiscal.id, ...params]);
        row = updated.rows[0];
      } else {
        const inserted = await db.query(InsertFiscalInfo, [accountId, ...params]);
        row = inserted.rows[0];
      }

      return { success: true, fiscal: row };
    } catch (error) {
      return { success: false, error: error.message, status: 500 };
    }
  }

  static async setActive(accountId, active, db) {
    try {
      const existing = await FiscalInfoManager.getByAccountId(accountId, db);
      if (!existing.success) {
        return { success: false, error: existing.error, status: 500 };
      }
      if (!existing.fiscal) {
        return { success: false, error: 'FISCAL_NOT_FOUND', status: 404 };
      }
      if (active === true && !existing.fiscal.authorization_accepted) {
        return { success: false, error: 'DISCLAIMER_REQUIRED', status: 400 };
      }

      const result = await db.query(SetFiscalActive, [existing.fiscal.id, !!active]);
      return { success: true, fiscal: result.rows[0] };
    } catch (error) {
      return { success: false, error: error.message, status: 500 };
    }
  }

  static async remove(accountId, db) {
    try {
      const existing = await FiscalInfoManager.getByAccountId(accountId, db);
      if (!existing.success) {
        return { success: false, error: existing.error, status: 500 };
      }
      if (!existing.fiscal) {
        return { success: false, error: 'FISCAL_NOT_FOUND', status: 404 };
      }

      const countResult = await db.query(CountInvoicesByFiscalId, [existing.fiscal.id]);
      const invoiceCount = countResult.rows[0]?.count || 0;

      let row;
      if (invoiceCount > 0) {
        const soft = await db.query(SoftDeleteFiscalInfo, [existing.fiscal.id]);
        row = soft.rows[0];
        return { success: true, fiscal: row, mode: 'soft' };
      }

      const hard = await db.query(HardDeleteFiscalInfo, [existing.fiscal.id]);
      row = hard.rows[0];
      return { success: true, fiscal: row, mode: 'hard' };
    } catch (error) {
      return { success: false, error: error.message, status: 500 };
    }
  }

  static async resolvePriceVariant(accountId, db) {
    const empty = {
      variant: 'full',
      fiscal: null,
      flags: {
        fiscal_registered: false,
        fiscal_active: false,
        sat_validation_status: null,
        persona_moral: false,
      },
    };

    if (!UUID_RE.test(String(accountId || ''))) {
      return { success: true, ...empty };
    }

    const looked = await FiscalInfoManager.getByAccountId(accountId, db);
    if (!looked.success) {
      return { success: false, error: looked.error, ...empty };
    }

    const fiscal = looked.fiscal;
    if (!fiscal) {
      return { success: true, ...empty };
    }

    const fiscal_active = !!fiscal.active;
    const sat_validation_status = fiscal.sat_validation_status || 'pending';
    const persona_moral = !!fiscal.persona_moral;
    const sat_valid = sat_validation_status === 'valid';
    const variant =
      fiscal_active && sat_valid && persona_moral ? 'moral' : 'full';

    return {
      success: true,
      variant,
      fiscal,
      flags: {
        fiscal_registered: true,
        fiscal_active,
        sat_validation_status,
        persona_moral,
      },
    };
  }

  static pickSetupPriceId(product, variant) {
    if (variant === 'moral' && product.stripe_price_id_setup_moral) {
      return product.stripe_price_id_setup_moral;
    }
    return product.stripe_price_id_setup;
  }

  static pickMonthlyPriceId(product, variant) {
    if (variant === 'moral' && product.stripe_price_id_monthly_moral) {
      return product.stripe_price_id_monthly_moral;
    }
    return product.stripe_price_id_monthly;
  }
}

module.exports = FiscalInfoManager;
