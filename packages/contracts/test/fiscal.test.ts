import { describe, expect, it } from 'vitest';
import { isValidItalianFiscalId, isValidItalianTaxCode, isValidItalianVat } from '../src/fiscal.js';

describe('isValidItalianVat (AC-FR-M0-02-1)', () => {
  it('rejects a VAT number with a wrong check digit', () => {
    expect(isValidItalianVat('12345678901')).toBe(false);
  });

  it('accepts a VAT number with the right check digit', () => {
    expect(isValidItalianVat('12345678903')).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isValidItalianVat('1234567890')).toBe(false);
    expect(isValidItalianVat('0000000000A')).toBe(false);
    expect(isValidItalianVat('00000000000')).toBe(false);
  });
});

describe('isValidItalianTaxCode', () => {
  it('accepts a valid personal tax code, in any case', () => {
    expect(isValidItalianTaxCode('RSSMRA80A01H501U')).toBe(true);
    expect(isValidItalianTaxCode('rssmra80a01h501u')).toBe(true);
  });

  it('rejects a wrong control character', () => {
    expect(isValidItalianTaxCode('RSSMRA80A01H501A')).toBe(false);
  });

  it('dispatches on length for generic fiscal ids', () => {
    expect(isValidItalianFiscalId('12345678903')).toBe(true);
    expect(isValidItalianFiscalId('RSSMRA80A01H501U')).toBe(true);
    expect(isValidItalianFiscalId('XYZ')).toBe(false);
  });
});
