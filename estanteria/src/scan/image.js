import { warpQuad } from './cvcrop.js';

// Utilidades de imagen para fotos de portada/contraportada tomadas con el celular.

/** Archivo (input file / cámara) → HTMLImageElement con orientación EXIF aplicada. */
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img); // el navegador ya respeta EXIF (image-orientation: from-image)
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

/**
 * Recorta (box normalizado 0–1, opcional) y reduce la imagen.
 * Devuelve { dataUrl, blob, width, height, aspect }.
 */
export async function renderImage(img, { box = null, quad = null, maxSide = 1400, quality = 0.85 } = {}) {
  if (quad && typeof window !== 'undefined' && window.cv?.Mat) {
    try { return await renderWarped(img, quad, maxSide, quality); } catch { /* sigue sin enderezar */ }
  }
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const b = validBox(box) ? box : { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(b.x * iw), sy = Math.round(b.y * ih);
  const sw = Math.round(b.w * iw), sh = Math.round(b.h * ih);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const dataUrl = cv.toDataURL('image/jpeg', quality);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', quality));
  return { dataUrl, blob, width: w, height: h, aspect: w / h };
}

/** Píxeles de la imagen reducida a `maxSide` (para OpenCV). */
export function imageDataOf(img, maxSide = 1600) {
  const iw = img.naturalWidth, ih = img.naturalHeight, s = Math.min(1, maxSide / Math.max(iw, ih));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(iw * s)); cv.height = Math.max(1, Math.round(ih * s));
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return ctx.getImageData(0, 0, cv.width, cv.height);
}

/** Endereza el libro (cuadrilátero 0–1) con OpenCV y lo devuelve como JPEG. */
async function renderWarped(img, quad, maxSide, quality) {
  const cv = window.cv;
  const mat = warpQuad(cv, imageDataOf(img, 2000), quad, maxSide);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = mat.cols; canvas.height = mat.rows;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(mat.data), mat.cols, mat.rows), 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return { dataUrl, blob, width: mat.cols, height: mat.rows, aspect: mat.cols / mat.rows };
  } finally { mat.delete(); }
}

export function validBox(b) {
  if (!b || typeof b !== 'object') return false;
  const { x, y, w, h } = b;
  return [x, y, w, h].every((v) => typeof v === 'number' && v >= 0 && v <= 1) &&
    w >= 0.2 && h >= 0.2 && x + w <= 1.02 && y + h <= 1.02;
}

/** Normaliza un recorte que viene del modelo (acepta x,y,w,h o x1,y1,x2,y2). */
export function normalizeBox(b) {
  if (!b) return null;
  let box = b;
  if ('x1' in b && 'x2' in b) box = { x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 };
  const c = (v) => Math.min(1, Math.max(0, Number(v)));
  box = { x: c(box.x), y: c(box.y), w: c(box.w), h: c(box.h) };
  box.w = Math.min(box.w, 1 - box.x);
  box.h = Math.min(box.h, 1 - box.y);
  return validBox(box) ? box : null;
}
