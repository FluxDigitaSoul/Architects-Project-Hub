import { Injectable } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type * as PdfJsModule from 'pdfjs-dist';

/** Lato lungo massimo della pagina renderizzata: nitida a zoom 200–300% senza esaurire la memoria. */
const MAX_SIDE_PX = 4200;
const MAX_SCALE = 4;

export interface RenderedPage {
  /** URL da usare come `src` dell'immagine (blob: per i PDF, URL firmato per le immagini). */
  src: string;
}

type PdfJs = typeof PdfJsModule;

/**
 * Trasforma la pagina di un elaborato in un'immagine per il visualizzatore (FR-M2-06).
 * I PDF si scaricano una volta per versione (l'URL firmato scade dopo 5 minuti) e le pagine
 * renderizzate restano in cache finché lo spazio di revisione non le rilascia.
 */
@Injectable({ providedIn: 'root' })
export class PageRenderer {
  private pdfjs: Promise<PdfJs> | null = null;
  private readonly docs = new Map<string, Promise<PDFDocumentProxy>>();
  private readonly pages = new Map<string, Promise<RenderedPage>>();

  /** `key` identifica il file (id della versione); `url` serve solo al primo caricamento. */
  render(key: string, url: string, mimeType: string | null, pageIndex: number): Promise<RenderedPage> {
    if (mimeType !== 'application/pdf') return Promise.resolve({ src: url });
    const cacheKey = `${key}:${pageIndex}`;
    let page = this.pages.get(cacheKey);
    if (!page) {
      page = this.renderPdfPage(key, url, pageIndex);
      page.catch(() => this.pages.delete(cacheKey));
      this.pages.set(cacheKey, page);
    }
    return page;
  }

  /** Libera memoria e URL temporanei della versione. */
  release(key: string): void {
    for (const [k, p] of this.pages) {
      if (!k.startsWith(`${key}:`)) continue;
      void p.then((r) => URL.revokeObjectURL(r.src)).catch(() => undefined);
      this.pages.delete(k);
    }
    const doc = this.docs.get(key);
    this.docs.delete(key);
    void doc?.then((d) => d.destroy()).catch(() => undefined);
  }

  private async renderPdfPage(key: string, url: string, pageIndex: number): Promise<RenderedPage> {
    const doc = await this.load(key, url);
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_SCALE, MAX_SIDE_PX / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    page.cleanup();
    if (!blob) throw new Error('Rendering della pagina non riuscito');
    return { src: URL.createObjectURL(blob) };
  }

  private load(key: string, url: string): Promise<PDFDocumentProxy> {
    let doc = this.docs.get(key);
    if (!doc) {
      doc = this.lib().then((pdfjs) =>
        // Scaricamento completo (niente richieste a intervalli): l'URL firmato ha vita breve.
        pdfjs.getDocument({ url, disableRange: true, disableStream: true }).promise,
      );
      doc.catch(() => this.docs.delete(key));
      this.docs.set(key, doc);
    }
    return doc;
  }

  /** pdf.js si carica solo quando serve (non pesa sul bundle iniziale). */
  private lib(): Promise<PdfJs> {
    this.pdfjs ??= import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf.worker', import.meta.url), { type: 'module' });
      return m;
    });
    return this.pdfjs;
  }
}
