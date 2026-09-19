import type { ErrorCode } from '@aph/contracts';
import { AppError } from '../common/app-error';

/**
 * Traduce gli errori di PostgreSQL in errori applicativi.
 * Le regole più critiche sono garantite anche dal database (trigger), che solleva eccezioni
 * con messaggi convenzionali: qui diventano i codici delle business rule (AFU cap. 6).
 */
const RAISED: Record<string, { code: ErrorCode; message: string }> = {
  VERSION_FROZEN: { code: 'VERSION_FROZEN', message: 'Questa versione è stata approvata o superata e non si può più modificare.' },
  VERSION_FILE_IMMUTABLE: { code: 'VERSION_FROZEN', message: 'Il file di una versione pubblicata non si può sostituire.' },
  REPORT_FINALIZED: { code: 'REPORT_FINALIZED', message: 'Il documento è definitivo e non si può modificare.' },
  INVALID_TRANSITION: { code: 'INVALID_TRANSITION', message: 'Operazione non consentita nello stato attuale.' },
  LAST_OWNER: { code: 'LAST_OWNER', message: 'Lo studio deve avere almeno un Owner attivo.' },
  TOKEN_NOT_REACTIVABLE: { code: 'INVALID_TRANSITION', message: 'Un link revocato non torna valido: generane uno nuovo.' },
  PROFILE_VERSION_IMMUTABLE: { code: 'CONFLICT', message: 'Una versione pubblicata del profilo normativo non si modifica.' },
  VISIT_NUMBER_IMMUTABLE: { code: 'CONFLICT', message: 'Il numero del verbale non si modifica.' },
  AUDIT_APPEND_ONLY: { code: 'CONFLICT', message: 'Il registro non si modifica.' },
  NOT_FOUND: { code: 'NOT_FOUND', message: 'Risorsa non trovata.' },
};

interface PgError {
  code?: string;
  message?: string;
  constraint?: string;
}

function isPgError(error: unknown): error is PgError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as PgError).code === 'string';
}

/** Restituisce l'AppError corrispondente, oppure null se l'errore non è riconosciuto. */
export function translatePgError(error: unknown): AppError | null {
  if (!isPgError(error)) return null;
  if (error.code === 'P0001') {
    const known = RAISED[error.message ?? ''];
    return known ? new AppError(known.code, known.message) : null;
  }
  switch (error.code) {
    case '23505':
      return new AppError('CONFLICT', 'Esiste già un elemento con questi dati.', { constraint: error.constraint });
    case '23514':
    case '22P02':
    case '22003':
      return new AppError('VALIDATION_FAILED', 'Dati non validi.', { constraint: error.constraint });
    case '23503':
      return new AppError('NOT_FOUND', 'Elemento collegato non trovato.');
    case '42501':
      // Violazione di una policy RLS: per BR-04 non si conferma l'esistenza della risorsa.
      return new AppError('NOT_FOUND', 'Risorsa non trovata.');
    default:
      return null;
  }
}
