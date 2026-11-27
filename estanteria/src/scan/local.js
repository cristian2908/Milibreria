// Lectura LOCAL de portada y contraportada: Tesseract (OCR) + códigos de barras/QR (ZXing)
// + reglas (reglas.js). Todo corre en el navegador; la foto no sale del dispositivo.
import { camposDesdeOCR } from './reglas.js';
import { completarDesdeTexto } from './completar.js';
import { TESS_BASE, TESS_LANG_AS_TEXT } from '../config.js';

const abs = (p) => new URL(p, typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').href;
let workerP = null;
let progreso = null; // callback del trabajo en curso

function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      const T = await import('tesseract.js');
      const { createWorker, OEM } = T.default || T;
      let lang = 'spa';
      if (TESS_LANG_AS_TEXT) {
        // datos del idioma en base64 (.txt) → bytes gzip; Tesseract los descomprime
        const r = await fetch(abs(`${TESS_BASE}lang/spa.traineddata.txt`));
        if (!r.ok) throw new Error(`idioma ${r.status}`);
        const b64 = (await r.text()).trim();
        const bin = atob(b64), data = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
        lang = [{ code: 'spa', data }];
      }
      return createWorker(lang, OEM.LSTM_ONLY, {
        workerPath: abs(`${TESS_BASE}worker.min.js`),
        corePath: abs(`${TESS_BASE}core`),
        langPath: abs(`${TESS_BASE}lang`),
        gzip: true,
        cacheMethod: 'none',
        logger: (m) => { if (m.status === 'recognizing text') progreso?.(m.progress); },
      });
    })().catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}

/** Empieza a cargar Tesseract (≈ 6 MB entre motor e idioma) sin esperar. */
export function precargarLocal() { getWorker().catch(() => {}); }

const lineasDe = (data) => (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({
  text: l.text, conf: l.confidence, bbox: l.bbox,
  words: l.words.map((w) => ({ text: w.text, conf: w.confidence, bbox: w.bbox })),
}))));

/** Lee códigos de barras (EAN-13 = ISBN) o QR en las fotos. Nativo si existe; si no, ZXing. */
async function leerCodigos(blobs) {
  const out = [];
  for (const blob of blobs.filter(Boolean)) {
    try {
      const bmp = await createImageBitmap(blob);
      if ('BarcodeDetector' in window) {
        try {
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'qr_code', 'upc_a'] });
          const r = await det.detect(bmp);
          out.push(...r.map((c) => c.rawValue));
          if (r.length) continue;
        } catch { /* formato no soportado: sigue con ZXing */ }
      }
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const lum = new Uint8ClampedArray(width * height);
      for (let i = 0; i < lum.length; i++) lum[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
      const ZX = await import('@zxing/library');
      const reader = new ZX.MultiFormatReader();
      reader.setHints(new Map([
        [ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.QR_CODE, ZX.BarcodeFormat.UPC_A]],
        [ZX.DecodeHintType.TRY_HARDER, true],
      ]));
      try { out.push(reader.decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(lum, width, height)))).getText()); }
      catch { /* sin código en esta foto */ }
    } catch { /* imagen ilegible */ }
  }
  return out;
}

/**
 * @param front Blob de la portada (ya recortada)  @param back Blob o null
 * @param onEtapa (etapa: 'cargando'|'portada'|'contraportada'|'codigos', avance 0–1)
 */
export async function leerLocal({ front, back = null, categories = [], onEtapa = () => {} }) {
  onEtapa('cargando', 0);
  const worker = await getWorker();
  progreso = (p) => onEtapa('portada', p);
  const f = await worker.recognize(front, {}, { blocks: true });
  let c = null;
  if (back) {
    progreso = (p) => onEtapa('contraportada', p);
    c = await worker.recognize(back, {}, { blocks: true });
  }
  progreso = null;
  onEtapa('codigos', 1);
  const codigos = await leerCodigos([back, front]);
  const r = camposDesdeOCR({ portada: lineasDe(f.data), contra: c ? lineasDe(c.data) : [], codigos, categorias: categories });
  return completarDesdeTexto(r);
}
