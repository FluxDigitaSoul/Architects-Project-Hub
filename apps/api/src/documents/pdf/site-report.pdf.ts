import { type DocMeta, type Letterhead, PdfDoc, formatDateIt, formatDateTimeIt } from './pdf-layout';

export interface SiteReportItem {
  text: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  addressee?: string | null;
  dueDate?: string | null;
  photoNumbers: number[];
}

export interface SiteReportData {
  number: number;
  startedAt: Date;
  endedAt: Date | null;
  project: { code: string; title: string; address: string; cadastral: string | null; permitType: string | null };
  clients: string[];
  contractors: string[];
  director: { name: string; title: string | null; registration: string | null };
  attendees: Array<{ name: string; qualification: string | null; organization: string | null }>;
  weather: string | null;
  previous: { number: number; items: Array<{ text: string; resolved: boolean }> } | null;
  progress: SiteReportItem[];
  issues: SiteReportItem[];
  orders: SiteReportItem[];
  generalNotes: string | null;
  photos: Array<{ number: number; image: Buffer | null; caption: string; takenAt: Date | null }>;
  place: string;
  closingFormula: string;
  aiAssisted: boolean;
}

const SEVERITY: Record<string, string> = { LOW: 'lieve', MEDIUM: 'media', HIGH: 'grave' };

function detailOf(item: SiteReportItem): string | null {
  const parts = [
    item.severity ? `Gravità ${SEVERITY[item.severity]}` : null,
    item.addressee ? `Destinatario: ${item.addressee}` : null,
    item.dueDate ? `TERMINE: ${formatDateIt(item.dueDate)}` : null,
    item.photoNumbers.length ? `vedi Foto ${item.photoNumbers.join(', ')}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Verbale di sopralluogo (FR-M5-01): sezioni da 1 a 13 nell'ordine dell'AFU. */
export function renderSiteReport(meta: Omit<DocMeta, 'title' | 'kind'>, letterhead: Letterhead, data: SiteReportData): Promise<Buffer> {
  return PdfDoc.render({ ...meta, title: `VERBALE DI SOPRALLUOGO N. ${data.number}`, kind: 'Verbale di sopralluogo' }, letterhead, (pdf) => {
    const end = data.endedAt
      ? ` – ${new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(data.endedAt)}`
      : '';
    const director = [data.director.title, data.director.name].filter(Boolean).join(' ');
    pdf.keyValues([
      ['Data e ora', `${formatDateTimeIt(data.startedAt)}${end}`],
      ['Commessa', `${data.project.code} — ${data.project.title}`],
      ['Cantiere', data.project.address],
      ['Dati catastali', data.project.cadastral],
      ['Committente', data.clients.join(', ')],
      ['Impresa esecutrice', data.contractors.join(', ') || null],
      ['Titolo edilizio', data.project.permitType],
      ['Direttore dei Lavori', `${director}${data.director.registration ? ` — ${data.director.registration}` : ''}`],
      ['Condizioni meteo', data.weather],
    ]);

    pdf.heading('Presenti');
    pdf.numberedList('P', data.attendees.map((a) => ({ text: a.name, detail: [a.qualification, a.organization].filter(Boolean).join(' — ') || null })));

    if (data.previous?.items.length) {
      pdf.heading(`Verifica delle azioni aperte (verbale n. ${data.previous.number})`);
      pdf.numberedList('V', data.previous.items.map((i) => ({ text: i.text, detail: i.resolved ? 'Risolta' : 'Ancora aperta' })));
    }

    pdf.heading('1. Avanzamento lavori');
    pdf.numberedList('1', data.progress.map((i) => ({ text: i.text, detail: detailOf(i) })));
    pdf.heading('2. Difformità, non conformità e fermi');
    pdf.numberedList('2', data.issues.map((i) => ({ text: i.text, detail: detailOf(i) })));
    pdf.heading('3. Disposizioni e ordini di servizio');
    pdf.numberedList('3', data.orders.map((i) => ({ text: i.text, detail: detailOf(i) })));

    if (data.generalNotes) {
      pdf.heading('Note generali');
      pdf.paragraph(data.generalNotes);
    }

    if (data.photos.length) {
      pdf.heading('Documentazione fotografica');
      pdf.photoGrid(data.photos.map((p) => ({
        number: p.number,
        image: p.image,
        caption: [p.caption, p.takenAt ? formatDateTimeIt(p.takenAt) : null].filter(Boolean).join(' — '),
      })));
    }

    pdf.heading('Chiusura');
    pdf.paragraph(`${data.place}, ${formatDateIt(data.startedAt)}. ${data.closingFormula}`);
    pdf.signatures([
      { role: 'Il Direttore dei Lavori', name: data.director.name, detail: data.director.registration },
      { role: 'L’impresa esecutrice (per presa visione)', name: data.contractors[0] ?? null },
      { role: 'Il committente (facoltativo)', name: data.clients[0] ?? null },
    ]);
    pdf.note('Il contenuto del verbale è sotto la responsabilità del professionista firmatario (BR-07).');
    if (data.aiAssisted) {
      pdf.note('Testo redatto con il supporto di strumenti di trascrizione e sintesi automatica e verificato dal Direttore dei Lavori.');
    }
  });
}
