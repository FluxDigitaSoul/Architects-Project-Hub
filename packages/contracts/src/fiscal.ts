/**
 * Validazioni fiscali italiane usate da profilo studio, committenti e imprese (FR-M0-02, AC-FR-M0-02-1).
 */

/** Partita IVA: 11 cifre con cifra di controllo (algoritmo di Luhn modificato). */
export function isValidItalianVat(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^0{11}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const digit = Number(value[i]);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  return (10 - (sum % 10)) % 10 === Number(value[10]);
}

const ODD: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

/** Codice fiscale delle persone fisiche (16 caratteri, con carattere di controllo; ammette l'omocodia). */
export function isValidItalianTaxCode(value: string): boolean {
  const code = value.toUpperCase();
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    const ch = code[i] as string;
    if (i % 2 === 0) {
      sum += ODD[ch] ?? 0;
    } else {
      sum += /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
    }
  }
  return String.fromCharCode(65 + (sum % 26)) === code[15];
}

/** Codice fiscale di un soggetto: persona fisica (16 caratteri) o persona giuridica (11 cifre come la P.IVA). */
export function isValidItalianFiscalId(value: string): boolean {
  const v = value.trim().toUpperCase();
  return v.length === 11 ? isValidItalianVat(v) : isValidItalianTaxCode(v);
}
