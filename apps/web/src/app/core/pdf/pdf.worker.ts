/// <reference lib="webworker" />
// Worker di pdf.js: il parsing dei PDF avviene fuori dal thread dell'interfaccia (FR-M2-06).
// Angular lo impacchetta da solo grazie a `new Worker(new URL('./pdf.worker', import.meta.url))`.
import 'pdfjs-dist/build/pdf.worker.min.mjs';
