import { HttpClient, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Errore dell'API nel formato uniforme { error: { code, message, requestId, details } } (FR-MT-18). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly details: Record<string, unknown> | undefined,
  ) {
    super(message);
  }

  /** Errori di validazione per campo (`details.fields` di VALIDATION_FAILED), chiave = percorso del campo. */
  get fields(): Record<string, string> {
    const list = (this.details?.['fields'] ?? []) as { path: string; message: string }[];
    return Object.fromEntries(list.map((f) => [f.path, f.message]));
  }

  /** Messaggio per l'utente: testo dell'API, con il codice di riferimento per gli errori interni. */
  get userMessage(): string {
    if (this.code === 'VALIDATION_FAILED') {
      const first = Object.values(this.fields)[0];
      return first ? `${this.message} ${first}` : this.message;
    }
    return this.status >= 500 && this.requestId ? `${this.message} (codice ${this.requestId.slice(0, 8)})` : this.message;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; requestId?: string; details?: Record<string, unknown> };
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof HttpErrorResponse) {
    const body = error.error as ErrorBody | null;
    if (body?.error?.code) {
      return new ApiError(error.status, body.error.code, body.error.message ?? 'Errore', body.error.requestId ?? null, body.error.details);
    }
    if (error.status === 0) return new ApiError(0, 'NETWORK', 'Connessione non disponibile. Riprova tra poco.', null, undefined);
  }
  return new ApiError(0, 'INTERNAL_ERROR', 'Si è verificato un errore imprevisto. Riprova.', null, undefined);
}

/** Token e studio correnti: stato minimo condiviso da interceptor e servizi (niente dipendenze circolari). */
@Injectable({ providedIn: 'root' })
export class ApiSession {
  readonly accessToken = signal<string | null>(null);
  readonly tenantSlug = signal<string | null>(null);
}

/** Aggiunge il token dell'utente e lo studio corrente; il portale usa invece il cookie di sessione. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBase)) return next(req);
  const session = inject(ApiSession);
  const isPortal = req.url.startsWith(`${environment.apiBase}/portal`);
  const headers: Record<string, string> = {};
  const token = session.accessToken();
  const slug = session.tenantSlug();
  if (token && !isPortal) headers['Authorization'] = `Bearer ${token}`;
  if (slug && req.url.startsWith(`${environment.apiBase}/studio`)) headers['X-Tenant-Slug'] = slug;
  return next(req.clone({ setHeaders: headers, withCredentials: isPortal }));
};

type Params = Record<string, string | number | boolean | undefined | null>;

/** Client dell'API con Promise (comodo con i signal). Gli errori arrivano sempre come ApiError. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      throw toApiError(error);
    }
  }

  private url(path: string): string {
    return `${environment.apiBase}${path}`;
  }

  get<T>(path: string, params?: Params): Promise<T> {
    const clean: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== '') clean[k] = v;
    return this.call(() => firstValueFrom(this.http.get<T>(this.url(path), { params: clean })));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.call(() => firstValueFrom(this.http.post<T>(this.url(path), body)));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.call(() => firstValueFrom(this.http.patch<T>(this.url(path), body)));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.call(() => firstValueFrom(this.http.put<T>(this.url(path), body)));
  }

  delete<T>(path: string): Promise<T> {
    return this.call(() => firstValueFrom(this.http.delete<T>(this.url(path))));
  }

  /** Scarica un file servito dall'API (es. PDF annullato con filigrana). */
  async download(path: string, fileName: string): Promise<void> {
    const blob = await this.call(() => firstValueFrom(this.http.get(this.url(path), { responseType: 'blob' })));
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  }
}

/**
 * Carica un file direttamente sullo storage con l'URL firmato dato dall'API: il file non passa
 * dal backend (FR-M2-01). Dopo va chiamato l'endpoint "complete", che verifica il file.
 */
export async function uploadToSignedUrl(uploadUrl: string, file: Blob, contentType?: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': contentType || file.type || 'application/octet-stream', 'x-upsert': 'false' },
  });
  if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', 'Caricamento del file non riuscito. Riprova.', null, undefined);
}
