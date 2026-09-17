'use strict';

const { normalizePipelineTestPhone } = require('../../utils/PhoneValidator');

const CANON = '+5213321540248';
const CANONICAL_RE = /^\+521[1-9]\d{9}$/;

function result(raw) {
  try {
    const r = normalizePipelineTestPhone(raw);
    if (r == null) return { ok: false };
    if (typeof r === 'string') return { ok: CANONICAL_RE.test(r), canonical: r };
    if (r && typeof r === 'object') {
      if (r.ok === false) return { ok: false };
      return { ok: true, canonical: r.canonical };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

describe('PhoneValidator.normalizePipelineTestPhone', () => {
  test.each([
    ['+5213321540248', CANON],
    ['+52 1 33 2154 0248', CANON],
    ['+521 332-154-0248', CANON],
    ['5213321540248', CANON],
    ['+523321540248', CANON],
    ['3321540248', CANON],
    ['525512345678', '+5215512345678'],
  ])('%j → canónico', (input, expected) => {
    const got = result(input);
    expect(got.ok).toBe(true);
    expect(got.canonical).toBe(expected);
    expect(got.canonical).toMatch(CANONICAL_RE);
  });

  test.each([
    [''],
    ['   '],
    ['+15551234567'],
    ['+34551234567'],
  ])('%j → rechazo', (input) => {
    expect(result(input).ok).toBe(false);
  });

  it('el canónico siempre incluye 521 (el 1 de WhatsApp MX se inserta)', () => {
    expect(result('525512345678').canonical).toBe('+5215512345678');
    expect(result('+523321540248').canonical).toBe(CANON);
    expect(result(CANON).canonical.startsWith('+521')).toBe(true);
  });
});
