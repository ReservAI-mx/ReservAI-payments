class FacturamaClient {
  static baseUrl() {
    return FacturamaClient.stripEnv(process.env.FACTURAMA_BASE_URL).replace(/\/$/, '')
      || 'https://apisandbox.facturama.mx';
  }

  /** Quita comillas/espacios que Fly secrets o .env a menudo dejan pegados. */
  static stripEnv(value) {
    if (value == null) return '';
    let s = String(value).trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1).trim();
    }
    return s;
  }

  /** Facturama sandbox no consulta el SAT real para receptores arbitrarios. */
  static isSandbox() {
    return /apisandbox\.facturama\.mx/i.test(FacturamaClient.baseUrl());
  }

  static authHeader() {
    const user = FacturamaClient.stripEnv(process.env.FACTURAMA_USER);
    const password = FacturamaClient.stripEnv(process.env.FACTURAMA_PASSWORD);
    if (!user || !password) {
      throw new Error('FACTURAMA_USER or FACTURAMA_PASSWORD not configured');
    }
    const token = Buffer.from(`${user}:${password}`, 'utf8').toString('base64');
    return `Basic ${token}`;
  }

  /** Diagnóstico sin filtrar secretos (útil ante HTTP 401). */
  static authDebugInfo() {
    const user = FacturamaClient.stripEnv(process.env.FACTURAMA_USER);
    const password = FacturamaClient.stripEnv(process.env.FACTURAMA_PASSWORD);
    const rawUser = process.env.FACTURAMA_USER == null ? '' : String(process.env.FACTURAMA_USER);
    const rawPass = process.env.FACTURAMA_PASSWORD == null ? '' : String(process.env.FACTURAMA_PASSWORD);
    return {
      baseUrl: FacturamaClient.baseUrl(),
      sandbox: FacturamaClient.isSandbox(),
      userLen: user.length,
      userHasWrappedQuotes:
        (rawUser.trim().startsWith('"') && rawUser.trim().endsWith('"')) ||
        (rawUser.trim().startsWith("'") && rawUser.trim().endsWith("'")),
      passLen: password.length,
      passHasWrappedQuotes:
        (rawPass.trim().startsWith('"') && rawPass.trim().endsWith('"')) ||
        (rawPass.trim().startsWith("'") && rawPass.trim().endsWith("'")),
      passHasWhitespace: /^\s|\s$/.test(rawPass),
    };
  }

  /** Mensaje útil: Facturama a veces responde {} vacío en 4xx. */
  static formatHttpError(data, status, path) {
    const keys = data && typeof data === 'object' ? Object.keys(data) : [];
    const hint =
      (typeof data?.Message === 'string' && data.Message) ||
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.ExceptionMessage === 'string' && data.ExceptionMessage) ||
      (data?.ModelState ? JSON.stringify(data.ModelState) : null) ||
      (Array.isArray(data) ? JSON.stringify(data) : null) ||
      (keys.length === 0
        ? status === 401
          ? 'Unauthorized (user/pass incorrectos, expirados, o sandbox vs prod)'
          : 'empty JSON body (revisa auth, URL o payload)'
        : null);
    const body =
      data == null
        ? ''
        : typeof data === 'object'
          ? JSON.stringify(data).slice(0, 500)
          : String(data).slice(0, 500);
    return `Facturama HTTP ${status} ${path}: ${hint || body}`;
  }

  static async createCfdi(payload) {
    const url = `${FacturamaClient.baseUrl()}/3/cfdis`;
    const started = Date.now();
    try {
      console.log(`[facturama] POST /3/cfdis rfc=${payload?.Receiver?.Rfc || '-'} place=${payload?.ExpeditionPlace || '-'}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: FacturamaClient.authHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      const ms = Date.now() - started;
      if (!response.ok) {
        const error = FacturamaClient.formatHttpError(data, response.status, '/3/cfdis');
        console.error(`[facturama] stamp failed status=${response.status} ms=${ms} error=${error}`);
        return {
          success: false,
          error,
          status: response.status,
        };
      }
      console.log(`[facturama] stamp ok ms=${ms} id=${data.Id || data.id || '-'}`);
      return { success: true, data };
    } catch (error) {
      console.error(`[facturama] stamp network error ms=${Date.now() - started}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  static async downloadIssued(format, facturamaId) {
    try {
      const response = await fetch(
        `${FacturamaClient.baseUrl()}/cfdi/${format}/issued/${encodeURIComponent(facturamaId)}`,
        {
          method: 'GET',
          headers: { Authorization: FacturamaClient.authHeader() },
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          error: FacturamaClient.formatHttpError(data, response.status, `/cfdi/${format}/issued`),
          status: response.status,
        };
      }
      if (!data.Content) {
        return { success: false, error: 'Facturama response missing Content' };
      }
      return {
        success: true,
        buffer: Buffer.from(data.Content, 'base64'),
        contentType: data.ContentType || format,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /** Valida receptor (RFC, nombre, CP, régimen) ante el SAT vía Facturama. */
  static async validateReceiver(payload) {
    try {
      const response = await fetch(
        `${FacturamaClient.baseUrl()}/api/customers/validate`,
        {
          method: 'POST',
          headers: {
            Authorization: FacturamaClient.authHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          error: FacturamaClient.formatHttpError(data, response.status, '/api/customers/validate'),
          status: response.status,
        };
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /** Alta en catálogo API Web. POST /api/Product */
  static async createProduct(payload) {
    const path = '/api/Product';
    const url = `${FacturamaClient.baseUrl()}${path}`;
    try {
      console.log(
        `[facturama] POST ${path} name=${payload?.Name || '-'} code=${payload?.CodeProdServ || '-'} unit=${payload?.UnitCode || '-'}`
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: FacturamaClient.authHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = FacturamaClient.formatHttpError(data, response.status, path);
        console.error(`[facturama] createProduct failed: ${error}`);
        if (response.status === 401) {
          console.error('[facturama] auth debug:', JSON.stringify(FacturamaClient.authDebugInfo()));
        }
        return {
          success: false,
          error,
          status: response.status,
        };
      }
      console.log(`[facturama] createProduct ok id=${data.Id || data.id || '-'}`);
      return { success: true, data };
    } catch (error) {
      console.error(`[facturama] createProduct network error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = FacturamaClient;
