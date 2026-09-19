/**
 * Riconoscimento del tipo reale di un file dai primi byte ("magic number"), non dall'estensione.
 * AC-FR-M2-01-1: un PNG rinominato .pdf si tratta come PNG; un eseguibile si rifiuta.
 * TC-SEC-05: i PDF con JavaScript o azioni automatiche si rifiutano.
 */
export type DetectedType =
  | { kind: 'pdf'; mime: 'application/pdf'; ext: 'pdf' }
  | { kind: 'image'; mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic'; ext: string }
  | { kind: 'audio'; mime: 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/ogg'; ext: string }
  | { kind: 'executable' }
  | { kind: 'unknown' };

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf: Buffer, start: number, end: number): string => buf.subarray(start, end).toString('latin1');

export function detectFileType(buf: Buffer): DetectedType {
  if (
    startsWith(buf, [0x4d, 0x5a]) ||
    startsWith(buf, [0x7f, 0x45, 0x4c, 0x46]) ||
    startsWith(buf, [0xcf, 0xfa, 0xed, 0xfe])
  ) {
    return { kind: 'executable' };
  }
  if (ascii(buf, 0, 5) === '%PDF-') return { kind: 'pdf', mime: 'application/pdf', ext: 'pdf' };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { kind: 'image', mime: 'image/webp', ext: 'webp' };
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return { kind: 'image', mime: 'image/heic', ext: 'heic' };
    if (['M4A ', 'mp42', 'isom', 'iso5', 'dash'].includes(brand)) return { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };
  }
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'audio', mime: 'audio/webm', ext: 'webm' };
  if (ascii(buf, 0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' };
  if (ascii(buf, 0, 3) === 'ID3' || startsWith(buf, [0xff, 0xfb])) return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
  return { kind: 'unknown' };
}

/** PDF con contenuti attivi (JavaScript, azioni all'apertura, file incorporati eseguibili). */
export function pdfHasActiveContent(buf: Buffer): boolean {
  const text = buf.toString('latin1');
  return /\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia)\b/.test(text);
}
