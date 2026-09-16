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
      { total: 1160, subtotal: 1000, tax: 160 }
    );
    expect(payload.Receiver.Rfc).toBe('AAA010101AAA');
    expect(payload.Receiver.FiscalRegime).toBe('601');
    expect(payload.Items[0].Total).toBe(1160);
    expect(payload.PaymentMethod).toBe('PUE');
  });
});
