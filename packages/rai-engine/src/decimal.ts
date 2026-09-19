import Decimal from 'decimal.js';
import type { DecimalString } from './types.js';

/**
 * Istanza decimale isolata (non modifica la configurazione globale di decimal.js):
 * 40 cifre significative, arrotondamento half-up (BR-22, ADR-010).
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export const ZERO = new D(0);

/** Converte una stringa decimale già validata. */
export function dec(value: DecimalString): Dec {
  return new D(value);
}

/** Serializza senza notazione esponenziale e senza zeri superflui ("2.70" → "2.7"). */
export function out(value: Dec): DecimalString {
  return value.toFixed();
}

export function sum(values: readonly Dec[]): Dec {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}

export function max(a: Dec, b: Dec): Dec {
  return a.greaterThan(b) ? a : b;
}

/**
 * Formattazione italiana per interfaccia e PDF: virgola decimale, punto per le migliaia,
 * arrotondamento half-up. Il segno dei valori negativi che si arrotondano a zero resta
 * visibile ("-0,00"), perché indica comunque un deficit (AC-FR-M3-08-4).
 */
export function formatDecimalIt(value: DecimalString, decimals = 2): string {
  const d = dec(value);
  const fixed = d.abs().toFixed(decimals);
  const [intPart = '0', fracPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = d.isNegative() && !d.isZero() ? '-' : '';
  return fracPart ? `${sign}${grouped},${fracPart}` : `${sign}${grouped}`;
}

/** Rapporto espresso come frazione "1/n" (es. 0,135 → "1/7,41"). */
export function ratioAsFraction(ratio: DecimalString): string {
  const r = dec(ratio);
  if (r.lessThanOrEqualTo(0)) {
    return '—';
  }
  return `1/${formatDecimalIt(out(new D(1).dividedBy(r)), 2)}`;
}
