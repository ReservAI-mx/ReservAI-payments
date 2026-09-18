class FacturamaClient {
  static baseUrl() {
    return (process.env.FACTURAMA_BASE_URL || 'https://apisandbox.facturama.mx').replace(/\/$/, '');
  }

  /** Facturama sandbox no consulta el SAT real para receptores arbitrarios. */
  static isSandbox() {
    return /apisandbox\.facturama\.mx/i.test(FacturamaClient.baseUrl());
  }

  static authHeader() {
    const user = process.env.FACTURAMA_USER;
    const password = process.env.FACTURAMA_PASSWORD;
    if (!user || !password) {
      throw new Error('FACTURAMA_USER or FACTURAMA_PASSWORD not configured');
    }
    const token = Buffer.from(`${user}:${password}`).toString('base64');
    return `Basic ${token}`;
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
        const error = typeof data === 'object' ? JSON.stringify(data) : String(data);
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
          error: typeof data === 'object' ? JSON.stringify(data) : String(data),
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
          error: typeof data === 'object' ? JSON.stringify(data) : String(data),
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
    try {
      const response = await fetch(`${FacturamaClient.baseUrl()}/api/Product`, {
        method: 'POST',
        headers: {
          Authorization: FacturamaClient.authHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          error: typeof data === 'object' ? JSON.stringify(data) : String(data),
          status: response.status,
        };
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = FacturamaClient;
