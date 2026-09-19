import type { z } from 'zod';
import { AppError } from './app-error';

/** Valida un input esterno con Zod e restituisce un errore VALIDATION_FAILED leggibile. */
export function parseBody<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('VALIDATION_FAILED', 'Dati non validi.', {
      fields: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
