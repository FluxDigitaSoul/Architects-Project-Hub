import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Primitive crittografiche usate da Magic Link, sessioni del portale, OTP e codici di verifica.
 * Nessun segreto in chiaro finisce nel database: si salva solo l'hash SHA-256 (FR-M1-05).
 */

/** Token opaco con 256 bit di entropia, in base64url (sicuro nel path di un URL). */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Confronto a tempo costante di due hash (evita timing attack sugli OTP). */
export function hashEquals(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** OTP numerico a 6 cifre (FR-M2-15). */
export function newOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** L'OTP si salva legato al suo challenge: lo stesso codice su un altro challenge non vale. */
export function otpHash(challengeId: string, code: string): Buffer {
  return sha256(`${challengeId}:${code}`);
}

// Alfabeto senza caratteri ambigui (0/O, 1/I/L) per i codici letti o dettati da persone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Codice di verifica breve per documenti e approvazioni, es. "K7PM-Q2XD" (FR-M5-00). */
export function newVerificationCode(): string {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** IP troncato per i log di accesso del portale (minimizzazione, cap. 12). */
export function truncateIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const clean = ip.replace(/^::ffff:/, '');
  if (clean.includes('.')) {
    const parts = clean.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : null;
  }
  const groups = clean.split(':').filter(Boolean);
  return groups.length ? `${groups.slice(0, 3).join(':')}::` : null;
}
