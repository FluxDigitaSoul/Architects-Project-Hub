// Genera le icone della PWA (AFU FR-M4-01) senza dipendenze: il marchio "PH" è disegnato con
// forme geometriche, sovracampionato per l'antialiasing e codificato in PNG con zlib.
// Uso: node scripts/generate-icons.mjs  →  public/icons/*.png
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const BG = [0x0f, 0x17, 0x2a];
const FG = [0xff, 0xff, 0xff];
const SAMPLES = 4;

const ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true }, // iOS arrotonda da sé: niente trasparenza
];

/** Marchio "PH" in coordinate unitarie; `scale` lo riduce per la zona sicura delle icone maskable. */
function glyph(x, y, scale) {
  const u = (v) => 0.5 + (v - 0.5) * scale;
  const h = 0.36, w = 0.075, pw = 0.2, gap = 0.06, hw = 0.22;
  const top = u(0.5 - h / 2), bottom = u(0.5 + h / 2), sw = w * scale;
  const x0 = u(0.5 - (pw + gap + hw) / 2);
  const inRect = (ax, ay, bx, by) => x >= ax && x <= bx && y >= ay && y <= by;
  // P: asta + occhiello a "D" (esterno meno interno)
  const bh = 0.21 * scale, r = bh / 2, xc = x0 + pw * scale - r, cy = top + r;
  const inD = (inset) => {
    const rr = r - inset;
    if (rr <= 0) return false;
    return inRect(x0, cy - rr, xc, cy + rr) || (x >= xc && (x - xc) ** 2 + (y - cy) ** 2 <= rr ** 2);
  };
  const p = inRect(x0, top, x0 + sw, bottom) || (inD(0) && !inD(sw));
  // H: due aste e la traversa
  const xh = x0 + (pw + gap) * scale, xe = xh + hw * scale, mid = (top + bottom) / 2;
  const hh = inRect(xh, top, xh + sw, bottom) || inRect(xe - sw, top, xe, bottom) || inRect(xh, mid - sw / 2, xe, mid + sw / 2);
  return p || hh;
}

function inRoundedSquare(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function render(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let bg = 0, fg = 0;
      for (let sj = 0; sj < SAMPLES; sj++) {
        for (let si = 0; si < SAMPLES; si++) {
          const x = (i + (si + 0.5) / SAMPLES) / size;
          const y = (j + (sj + 0.5) / SAMPLES) / size;
          if (!maskable && !inRoundedSquare(x, y, 0.22)) continue;
          bg++;
          if (glyph(x, y, maskable ? 0.8 : 1)) fg++;
        }
      }
      const total = SAMPLES * SAMPLES;
      const o = (j * size + i) * 4;
      const t = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * t);
      px[o + 3] = Math.round((bg / total) * 255);
    }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit per canale
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const icon of ICONS) {
  const file = join(OUT, icon.file);
  writeFileSync(file, png(icon.size, render(icon.size, icon.maskable)));
  stdout.write(`✓ ${icon.file} (${icon.size}px)\n`);
}
