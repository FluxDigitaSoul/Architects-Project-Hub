/**
 * Codici d'errore applicativi. Ogni codice corrisponde a una regola dell'AFU
 * (cap. 6 "Business rules") o a un errore tecnico trasversale (FR-MT-18).
 * Il formato di risposta è: { error: { code, message, requestId, details? } }.
 */
export const ERROR_HTTP_STATUS = {
  // Tecnici / trasversali
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404, // anche per risorse di altri tenant (BR-04)
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,

  // Business rules
  VERSION_FROZEN: 409, // BR-01
  AI_REVIEW_PENDING: 422, // BR-05
  RAI_NOT_ATTESTABLE: 422, // BR-06
  SIGNER_NOT_QUALIFIED: 422, // BR-08
  REPORT_FINALIZED: 409, // BR-09
  NOT_SIGNER: 403, // BR-10
  VERSION_NOT_CURRENT: 409, // BR-10
  PROJECT_NOT_ACTIVE: 409, // BR-10
  OTP_REQUIRED: 401, // BR-10
  LAST_OWNER: 409, // BR-12
  PROVISIONING_FAILED: 500, // BR-26
  PLAN_LIMIT_REACHED: 402, // BR-28
  FEATURE_NOT_IN_PLAN: 403, // BR-28
  TENANT_READ_ONLY: 402, // BR-29 (trial scaduto / pagamento mancante)
  SLUG_UNAVAILABLE: 409, // FR-M6-02
} as const;

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS;

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_HTTP_STATUS, value);
}
