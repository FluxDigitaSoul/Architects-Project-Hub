import { type ErrorCode } from '@aph/contracts';

/** Errore applicativo con codice delle business rule (AFU cap. 6, @aph/contracts). */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
