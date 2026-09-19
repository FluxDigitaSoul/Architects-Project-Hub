import PDFDocument from 'pdfkit';

/**
 * Impaginazione comune dei documenti (FR-M5-00): A4, margini 20 mm (15 mm in basso),
 * carta intestata dello studio, intestazione ripetuta da pagina 2, piè di pagina "Pagina X di Y",
 * filigrana per bozze e documenti annullati, font open source incorporato.
 * Il testo del corpo è sempre nero: il colore dello studio si usa solo per filetti (AC-FR-M5-00-1).
 */
const MM = 72 / 25.4;
const MARGIN = 20 * MM;
const MARGIN_BOTTOM = 15 * MM;
const FOOTER_SPACE = 14 * MM;
const FONT_REGULAR = require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff');
const FONT_BOLD = require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff');

export interface Letterhead {
  studioName: string;
  vatNumber: string | null;
  address: string | null;
  email: string | null;
  pec: string | null;
  phone: string | null;
  primaryColor: string;
  logo: Buffer | null;
}

export interface DocMeta {
  /** Titolo in maiuscolo mostrato in prima pagina, es. "VERBALE DI SOPRALLUOGO N. 3". */
  title: string;
  /** Etichetta breve per l'intestazione ripetuta, es. "Verbale di sopralluogo". */
  kind: string;
  projectCode: string;
  documentId: string;
  /** Data del documento: fissa i metadati, così lo stesso input produce lo stesso PDF (FR-M5-04). */
  date: Date;
  author: string;
  subject: string;
  keywords?: string[];
  verificationCode?: string | null;
  watermark?: string | null;
}

export type Cell = string | number | null | undefined;

export function formatDateIt(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }).format(d);
}

export function formatDateTimeIt(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome',
  }).format(d);
}

export class PdfDoc {
  readonly doc: PDFKit.PDFDocument;
  private readonly chunks: Buffer[] = [];

  private constructor(private readonly meta: DocMeta, private readonly letterhead: Letterhead) {
    this.doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN_BOTTOM + FOOTER_SPACE },
      bufferPages: true,
      pdfVersion: '1.7',
      lang: 'it-IT',
      displayTitle: true,
      info: {
        Title: meta.title,
        Author: meta.author,
        Subject: meta.subject,
        Keywords: (meta.keywords ?? []).join(', '),
        Creator: meta.author,
        Producer: meta.author,
        CreationDate: meta.date,
        ModDate: meta.date,
      },
    });
    this.doc.registerFont('regular', FONT_REGULAR);
    this.doc.registerFont('bold', FONT_BOLD);
    this.doc.font('regular').fontSize(10).fillColor('#000000');
    this.doc.on('data', (chunk: Buffer) => this.chunks.push(chunk));
  }

  /** Genera il PDF: `draw` scrive il contenuto, qui si aggiungono carta intestata, intestazioni, piè di pagina e filigrane. */
  static async render(meta: DocMeta, letterhead: Letterhead, draw: (pdf: PdfDoc) => Promise<void> | void): Promise<Buffer> {
    const pdf = new PdfDoc(meta, letterhead);
    pdf.firstPageHeader();
    await draw(pdf);
    pdf.decoratePages();
    const done = new Promise<Buffer>((resolve, reject) => {
      pdf.doc.on('end', () => resolve(Buffer.concat(pdf.chunks)));
      pdf.doc.on('error', reject);
    });
    pdf.doc.end();
    return done;
  }

  get width(): number {
    return this.doc.page.width - MARGIN * 2;
  }

  private rule(y: number, color = this.letterhead.primaryColor, weight = 1): void {
    this.doc.save().moveTo(MARGIN, y).lineTo(this.doc.page.width - MARGIN, y).lineWidth(weight).strokeColor(color).stroke().restore();
  }

  private firstPageHeader(): void {
    const lh = this.letterhead;
    const top = MARGIN;
    let textX = MARGIN;
    if (lh.logo) {
      try {
        this.doc.image(lh.logo, MARGIN, top, { fit: [40 * MM, 18 * MM] });
        textX = MARGIN + 44 * MM;
      } catch {
        textX = MARGIN; // logo non leggibile: si prosegue con il solo nome
      }
    }
    const textWidth = this.width - (textX - MARGIN);
    this.doc.font('bold').fontSize(12).text(lh.studioName, textX, top, { width: textWidth });
    const details = [
      lh.address,
      [lh.vatNumber ? `P.IVA ${lh.vatNumber}` : null, lh.phone].filter(Boolean).join(' · '),
      [lh.email, lh.pec ? `PEC ${lh.pec}` : null].filter(Boolean).join(' · '),
    ].filter((l): l is string => Boolean(l));
    this.doc.font('regular').fontSize(8).text(details.join('\n'), textX, this.doc.y + 2, { width: textWidth });
    const y = Math.max(this.doc.y, top + 18 * MM) + 4 * MM;
    this.rule(y, lh.primaryColor, 1.5);
    this.doc.x = MARGIN;
    this.doc.y = y + 5 * MM;
    this.doc.font('bold').fontSize(14).text(this.meta.title, { width: this.width, align: 'left' });
    this.doc.font('regular').fontSize(10).moveDown(0.8);
  }

  /** Intestazione ripetuta (da pagina 2), piè di pagina e filigrana su tutte le pagine. */
  private decoratePages(): void {
    const range = this.doc.bufferedPageRange();
    const total = range.count;
    for (let i = range.start; i < range.start + total; i += 1) {
      this.doc.switchToPage(i);
      const { width, height } = this.doc.page;
      const saved = this.doc.page.margins.bottom;
      this.doc.page.margins.bottom = 0; // si scrive nel margine senza creare nuove pagine
      if (i > range.start) {
        const header = `${this.letterhead.studioName} — ${this.meta.kind} — Commessa ${this.meta.projectCode} — ${this.meta.documentId}`;
        this.doc.font('regular').fontSize(7.5).fillColor('#444444').text(header, MARGIN, MARGIN - 8 * MM, { width: width - MARGIN * 2, lineBreak: false });
        this.rule(MARGIN - 3 * MM, '#BBBBBB', 0.5);
      }
      const footerY = height - MARGIN_BOTTOM - 6 * MM;
      this.rule(footerY - 2 * MM, '#BBBBBB', 0.5);
      const left = [
        this.letterhead.studioName,
        this.letterhead.vatNumber ? `P.IVA ${this.letterhead.vatNumber}` : null,
        `Doc. ${this.meta.documentId}`,
        this.meta.verificationCode ? `Codice di verifica ${this.meta.verificationCode}` : null,
        `Generato il ${formatDateIt(this.meta.date)}`,
      ].filter(Boolean).join(' · ');
      this.doc.font('regular').fontSize(7.5).fillColor('#444444')
        .text(left, MARGIN, footerY, { width: width - MARGIN * 2 - 30 * MM, lineBreak: false })
        .text(`Pagina ${i - range.start + 1} di ${total}`, width - MARGIN - 30 * MM, footerY, { width: 30 * MM, align: 'right', lineBreak: false });
      if (this.meta.watermark) this.watermark(this.meta.watermark);
      this.doc.page.margins.bottom = saved;
      this.doc.fillColor('#000000');
    }
  }

  private watermark(text: string): void {
    const { width, height } = this.doc.page;
    this.doc.save()
      .rotate(-35, { origin: [width / 2, height / 2] })
      .font('bold').fontSize(42).fillColor('#9CA3AF').fillOpacity(0.25)
      .text(text, 0, height / 2 - 25, { width, align: 'center', lineBreak: false })
      .restore();
    this.doc.fillOpacity(1);
  }

  // ---- Blocchi di contenuto ------------------------------------------------------------------

  private ensureSpace(heightPt: number): void {
    const bottom = this.doc.page.height - this.doc.page.margins.bottom;
    if (this.doc.y + heightPt > bottom) this.doc.addPage();
  }

  heading(text: string): void {
    this.ensureSpace(40);
    this.doc.moveDown(0.6).font('bold').fontSize(11).fillColor('#000000').text(text, MARGIN, this.doc.y, { width: this.width });
    this.rule(this.doc.y + 2, this.letterhead.primaryColor, 0.75);
    this.doc.moveDown(0.5).font('regular').fontSize(10);
  }

  paragraph(text: string, opts: { size?: number; bold?: boolean } = {}): void {
    this.doc.font(opts.bold ? 'bold' : 'regular').fontSize(opts.size ?? 10).fillColor('#000000')
      .text(text, MARGIN, this.doc.y, { width: this.width, align: 'justify' });
    this.doc.moveDown(0.3).font('regular').fontSize(10);
  }

  note(text: string): void {
    this.doc.font('regular').fontSize(8).fillColor('#333333').text(text, MARGIN, this.doc.y, { width: this.width });
    this.doc.fillColor('#000000').fontSize(10).moveDown(0.3);
  }

  /** Coppie etichetta/valore su due colonne. */
  keyValues(rows: Array<[string, Cell]>): void {
    const labelWidth = 45 * MM;
    for (const [label, value] of rows) {
      if (value === null || value === undefined || value === '') continue;
      const text = String(value);
      this.doc.font('regular').fontSize(10);
      const h = Math.max(this.doc.heightOfString(text, { width: this.width - labelWidth }), 12);
      this.ensureSpace(h + 2);
      const y = this.doc.y;
      this.doc.font('bold').fontSize(9).text(label, MARGIN, y, { width: labelWidth - 3 * MM });
      this.doc.font('regular').fontSize(10).text(text, MARGIN + labelWidth, y, { width: this.width - labelWidth });
      this.doc.y = Math.max(this.doc.y, y + h) + 2;
    }
    this.doc.x = MARGIN;
    this.doc.moveDown(0.3);
  }

  /** Elenco numerato con numerazione di blocco (1.1, 1.2 …) come nel verbale (FR-M5-01). */
  numberedList(prefix: string, items: Array<{ text: string; detail?: string | null }>): void {
    if (!items.length) {
      this.note('Nessuna voce.');
      return;
    }
    items.forEach((item, i) => {
      const indent = 12 * MM;
      this.doc.font('regular').fontSize(10);
      const h = this.doc.heightOfString(item.text, { width: this.width - indent }) + (item.detail ? 12 : 0);
      this.ensureSpace(h + 4);
      const y = this.doc.y;
      this.doc.font('bold').fontSize(10).text(`${prefix}.${i + 1}`, MARGIN, y, { width: indent });
      this.doc.font('regular').fontSize(10).text(item.text, MARGIN + indent, y, { width: this.width - indent });
      if (item.detail) {
        this.doc.fontSize(8.5).fillColor('#333333').text(item.detail, MARGIN + indent, this.doc.y, { width: this.width - indent });
        this.doc.fillColor('#000000').fontSize(10);
      }
      this.doc.moveDown(0.3);
    });
    this.doc.x = MARGIN;
  }

  /** Tabella semplice con intestazione ripetuta a ogni cambio pagina. */
  table(columns: Array<{ header: string; width: number; align?: 'left' | 'right' | 'center' }>, rows: Cell[][], fontSize = 8): void {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.width);
    const drawRow = (cells: Cell[], bold: boolean): void => {
      const texts = cells.map((c) => (c === null || c === undefined ? '' : String(c)));
      this.doc.font(bold ? 'bold' : 'regular').fontSize(fontSize);
      const h = Math.max(...texts.map((t, i) => this.doc.heightOfString(t, { width: (widths[i] ?? 0) - 4 }))) + 4;
      if (this.doc.y + h > this.doc.page.height - this.doc.page.margins.bottom) {
        this.doc.addPage();
        if (!bold) drawRow(columns.map((c) => c.header), true);
      }
      const y = this.doc.y;
      let x = MARGIN;
      texts.forEach((t, i) => {
        this.doc.font(bold ? 'bold' : 'regular').fontSize(fontSize).text(t, x + 2, y + 2, { width: (widths[i] ?? 0) - 4, align: columns[i]?.align ?? 'left' });
        x += widths[i] ?? 0;
      });
      this.doc.y = y + h;
      this.doc.save().moveTo(MARGIN, this.doc.y).lineTo(MARGIN + this.width, this.doc.y).lineWidth(0.3).strokeColor('#BBBBBB').stroke().restore();
    };
    this.ensureSpace(30);
    drawRow(columns.map((c) => c.header), true);
    rows.forEach((r) => drawRow(r, false));
    this.doc.x = MARGIN;
    this.doc.font('regular').fontSize(10).moveDown(0.6);
  }

  /** Griglia di foto: 2 per riga, con numero e didascalia (FR-M5-01 punto 11). */
  photoGrid(photos: Array<{ number: number; image: Buffer | null; caption: string }>): void {
    const gap = 6 * MM;
    const cellWidth = (this.width - gap) / 2;
    const imageHeight = 60 * MM;
    for (let i = 0; i < photos.length; i += 2) {
      const pair = photos.slice(i, i + 2);
      this.ensureSpace(imageHeight + 16 * MM);
      const y = this.doc.y;
      pair.forEach((p, j) => {
        const x = MARGIN + j * (cellWidth + gap);
        let drawn = false;
        if (p.image) {
          try {
            this.doc.image(p.image, x, y, { fit: [cellWidth, imageHeight], align: 'center', valign: 'center' });
            drawn = true;
          } catch {
            drawn = false;
          }
        }
        if (!drawn) this.doc.rect(x, y, cellWidth, imageHeight).lineWidth(0.5).strokeColor('#BBBBBB').stroke();
        this.doc.font('bold').fontSize(8.5).fillColor('#000000').text(`Foto ${p.number}`, x, y + imageHeight + 2, { width: cellWidth });
        this.doc.font('regular').fontSize(8).text(p.caption, x, this.doc.y, { width: cellWidth, height: 9 * MM, ellipsis: true });
      });
      this.doc.x = MARGIN;
      this.doc.y = y + imageHeight + 16 * MM;
    }
  }

  /** Riquadri firma affiancati (FR-M5-02: firma autografa sulla stampa o firma digitale esterna). */
  signatures(boxes: Array<{ role: string; name?: string | null; detail?: string | null; image?: Buffer | null }>): void {
    const gap = 6 * MM;
    const perRow = Math.max(1, Math.min(3, boxes.length));
    const boxWidth = (this.width - gap * (perRow - 1)) / perRow;
    const boxHeight = 30 * MM;
    this.ensureSpace(boxHeight + 10 * MM);
    const y = this.doc.y + 2 * MM;
    boxes.slice(0, perRow).forEach((b, i) => {
      const x = MARGIN + i * (boxWidth + gap);
      this.doc.font('bold').fontSize(8.5).text(b.role, x, y, { width: boxWidth });
      if (b.name) this.doc.font('regular').fontSize(8.5).text(b.name, x, this.doc.y, { width: boxWidth });
      if (b.detail) this.doc.font('regular').fontSize(7.5).fillColor('#333333').text(b.detail, x, this.doc.y, { width: boxWidth }).fillColor('#000000');
      if (b.image) {
        try {
          this.doc.image(b.image, x, y + 12 * MM, { fit: [boxWidth, 14 * MM] });
        } catch {
          // immagine della firma non leggibile: resta lo spazio per la firma autografa
        }
      }
      this.doc.save().moveTo(x, y + boxHeight).lineTo(x + boxWidth, y + boxHeight).lineWidth(0.5).strokeColor('#000000').stroke().restore();
    });
    this.doc.x = MARGIN;
    this.doc.y = y + boxHeight + 6 * MM;
    this.doc.font('regular').fontSize(10);
  }

  spacer(lines = 1): void {
    this.doc.moveDown(lines);
  }
}
