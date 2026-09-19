import { Injectable } from '@nestjs/common';
import { AppError } from './app-error';

/**
 * Limitatore a finestra fissa in memoria (NFR-SEC-05, TC-SEC-07): protegge accesso al portale,
 * richiesta di link e OTP da tentativi a forza bruta.
 * Vale per singola istanza: con più istanze dell'API va spostato su un archivio condiviso (Redis).
 */
@Injectable()
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      throw new AppError('RATE_LIMITED', 'Troppi tentativi. Riprova tra qualche minuto.', { retryAfterSec });
    }
  }
}
