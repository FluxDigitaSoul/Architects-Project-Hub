import { type DocMeta, type Letterhead, PdfDoc, formatDateIt } from './pdf-layout';

export interface ApprovalSummaryData {
  project: { code: string; title: string };
  drawing: { sheetCode: string | null; title: string; category: string; phase: string | null };
  version: { number: number; publishedAt: Date | null; pageCount: number | null };
  signer: { name: string; role: string | null; maskedEmail: string };
  approvedAt: Date;
  ip: string | null;
  userAgent: string | null;
  otp: { sentAt: Date; verifiedAt: Date | null };
  fileSha256: string;
  verificationCode: string;
  declarationText: string;
  pins: { total: number; resolved: number; openAtApproval: Array<{ number: number; firstComment: string }> };
}

const utc = (d: Date): string => d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
const rome = (d: Date): string =>
  new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Rome' }).format(d);

/** Riepilogo di approvazione dell'elaborato (FR-M5-10, AC-FR-M5-10-1). */
export function renderApprovalSummary(meta: Omit<DocMeta, 'title' | 'kind'>, letterhead: Letterhead, data: ApprovalSummaryData): Promise<Buffer> {
  return PdfDoc.render({ ...meta, title: 'RIEPILOGO DI APPROVAZIONE ELABORATO', kind: 'Riepilogo di approvazione' }, letterhead, (pdf) => {
    pdf.keyValues([
      ['Commessa', `${data.project.code} — ${data.project.title}`],
      ['Elaborato', `${data.drawing.sheetCode ? `${data.drawing.sheetCode} — ` : ''}${data.drawing.title}`],
      ['Categoria / fase', [data.drawing.category, data.drawing.phase].filter(Boolean).join(' / ')],
      ['Versione', `v${data.version.number}${data.version.pageCount ? ` — ${data.version.pageCount} pagine` : ''}`],
      ['Pubblicata il', data.version.publishedAt ? formatDateIt(data.version.publishedAt) : null],
    ]);

    pdf.heading('Dati dell’approvazione');
    pdf.keyValues([
      ['Firmatario', `${data.signer.name}${data.signer.role ? ` (${data.signer.role})` : ''}`],
      ['Data e ora', `${rome(data.approvedAt)} (ora italiana) — ${utc(data.approvedAt)}`],
      ['Indirizzo IP', data.ip],
      ['Browser e dispositivo', data.userAgent],
      ['Metodo di verifica', `Codice OTP inviato a ${data.signer.maskedEmail} il ${rome(data.otp.sentAt)}${data.otp.verifiedAt ? ` e verificato il ${rome(data.otp.verifiedAt)}` : ''}`],
      ['Impronta SHA-256 del file approvato', data.fileSha256],
      ['Codice di verifica dell’approvazione', data.verificationCode],
    ]);

    pdf.heading('Dichiarazione accettata');
    pdf.paragraph(data.declarationText);

    pdf.heading('Riepilogo dei pin');
    pdf.keyValues([
      ['Pin totali', String(data.pins.total)],
      ['Risolti', String(data.pins.resolved)],
      ['Aperti al momento dell’approvazione', String(data.pins.openAtApproval.length)],
    ]);
    if (data.pins.openAtApproval.length) {
      pdf.numberedList('P', data.pins.openAtApproval.map((p) => ({ text: `Pin ${p.number}`, detail: p.firstComment })));
    }

    pdf.note('La verifica dell’integrità si fa confrontando l’impronta SHA-256 del file approvato con quella del file in possesso delle parti.');
    pdf.note('Approvazione con firma elettronica semplice ai sensi del Reg. UE 910/2014 (eIDAS), rafforzata da codice OTP e impronta del documento.');
  });
}
