const { DateTime } = require('luxon');
const InvoiceManager = require('../../utils/InvoiceManager');

describe('InvoiceManager', () => {
  test('isPaymentInCurrentMonth true for now in Mexico City', () => {
    const now = DateTime.now().setZone('America/Mexico_City').toJSDate();
    expect(InvoiceManager.isPaymentInCurrentMonth(now)).toBe(true);
  });

  test('isPaymentInCurrentMonth false for previous month', () => {
    const prev = DateTime.now()
      .setZone('America/Mexico_City')
      .minus({ months: 1 })
      .toJSDate();
    expect(InvoiceManager.isPaymentInCurrentMonth(prev)).toBe(false);
  });

  test('splitAmountWithIva derives subtotal and tax from total', () => {
    const r = InvoiceManager.splitAmountWithIva(1160);
    expect(r.error).toBeUndefined();
    expect(r.total).toBe(1160);
    expect(r.subtotal).toBe(1000);
    expect(r.tax).toBe(160);
    expect(r.isr_retention).toBe(0);
  });

  test('splitAmountWithIva with ISR retention keeps total = subtotal+IVA-ISR', () => {
    const r = InvoiceManager.splitAmountWithIva(1145.5, { isrRetention: true });
    expect(r.error).toBeUndefined();
    expect(r.isr_retention).toBeGreaterThan(0);
    expect(r.tax).toBeGreaterThan(0);
    const recomputed =
      Math.round((r.subtotal + r.tax - r.isr_retention) * 100) / 100;
    expect(recomputed).toBe(r.total);
    expect(r.total).toBe(1145.5);
  });

  test('shouldApplyIsrRetention only for persona moral', () => {
    expect(InvoiceManager.shouldApplyIsrRetention({ persona_moral: true })).toBe(
      true
    );
    expect(InvoiceManager.shouldApplyIsrRetention({ persona_moral: false })).toBe(
      false
    );
    expect(InvoiceManager.shouldApplyIsrRetention(null)).toBe(false);
  });

  test('buildCfdiPayload maps fiscal receiver fields', () => {
    const payload = InvoiceManager.buildCfdiPayload(
      {
        razon_social: 'ACME SA DE CV',
        rfc: 'AAA010101AAA',
        regimen_fiscal: '601',
        codigo_postal: '01000',
        uso_cfdi: 'G03',
      },
      { id: 'ph-1', stripe_invoice_id: 'in_1' },
      { total: 1160, subtotal: 1000, tax: 160, isr_retention: 0 }
    );
    expect(payload.Receiver.Rfc).toBe('AAA010101AAA');
    expect(payload.Receiver.FiscalRegime).toBe('601');
    expect(payload.Items[0].Total).toBe(1160);
    expect(payload.PaymentMethod).toBe('PUE');
    expect(payload.Items[0].Taxes).toHaveLength(1);
    expect(payload.Items[0].Taxes[0].IsRetention).toBe(false);
  });

  test('buildCfdiPayload includes ISR retention for persona moral amounts', () => {
    const amounts = InvoiceManager.splitAmountWithIva(1145.5, {
      isrRetention: true,
    });
    const payload = InvoiceManager.buildCfdiPayload(
      {
        razon_social: 'ACME SA DE CV',
        rfc: 'AAA010101AAA',
        regimen_fiscal: '601',
        codigo_postal: '01000',
        uso_cfdi: 'G03',
        persona_moral: true,
      },
      { id: 'ph-1', stripe_invoice_id: 'in_1' },
      amounts
    );
    const taxes = payload.Items[0].Taxes;
    expect(taxes).toHaveLength(2);
    expect(taxes[0]).toMatchObject({
      Name: 'IVA',
      Rate: 0.16,
      IsRetention: false,
    });
    expect(taxes[1]).toMatchObject({
      Name: 'ISR',
      Rate: 0.0125,
      IsRetention: true,
      IsFederalTax: true,
    });
    expect(taxes[1].Total).toBe(amounts.isr_retention);
    expect(payload.Items[0].Total).toBe(1145.5);
  });

  test('buildCfdiPayload prefers product codes over env', () => {
    const payload = InvoiceManager.buildCfdiPayload(
      {
        razon_social: 'ACME',
        rfc: 'AAA010101AAA',
        regimen_fiscal: '601',
        codigo_postal: '01000',
        uso_cfdi: 'G01',
      },
      { id: 'ph-1' },
      { total: 116, subtotal: 100, tax: 16, isr_retention: 0 },
      { code_prod_serv: '12345678', unit_code: 'H87', unit: 'Pieza' }
    );
    expect(payload.Items[0].ProductCode).toBe('12345678');
    expect(payload.Items[0].UnitCode).toBe('H87');
    expect(payload.Items[0].Unit).toBe('Pieza');
  });
});
