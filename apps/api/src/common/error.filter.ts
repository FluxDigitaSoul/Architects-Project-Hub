import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ERROR_HTTP_STATUS, type ErrorBody, type ErrorCode } from '@aph/contracts';
import type { Request, Response } from 'express';
import { AppError } from './app-error';

const HTTP_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

/**
 * Formato d'errore uniforme: { error: { code, message, requestId, details? } }.
 * Mai stack trace o dettagli interni verso il client (NFR-SEC-10).
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const requestId = req.id ?? 'n/a';

    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'Si è verificato un errore imprevisto. Riprova o contatta il supporto indicando il codice.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof AppError) {
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      code = HTTP_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED');
      message = status === 404 ? 'Risorsa non trovata.' : exception.message;
    }

    const status = ERROR_HTTP_STATUS[code];
    if (status >= 500) {
      this.logger.error(`[${requestId}] ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    }
    const body: ErrorBody = { error: { code, message, requestId, ...(details ? { details } : {}) } };
    res.status(status).json(body);
  }
}
