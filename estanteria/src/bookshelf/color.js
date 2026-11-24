// Color del lomo derivado de la portada + texto legible (claro u oscuro).

const DARK_TEXT = [24, 22, 20];
const LIGHT_TEXT = [250, 247, 240];

/** Promedia una franja vertical del borde izquierdo de la portada (lado del lomo). */
export function sampleSpineColor(img) {
  const w = 48;
  const h = Math.max(8, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  // getImageData lanza SecurityError si la imagen es de otro origen sin CORS.
  const strip = Math.max(2, Math.round(w * 0.08));
  const { data } = ctx.getImageData(0, 0, strip, h);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (!n) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Color determinista a partir de un texto (respaldo si no se puede leer la portada). */
export function colorFromString(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return hslToRgb(hue, 0.38, 0.36);
}

export function parseColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Elige texto claro u oscuro según el contraste WCAG con el fondo. */
export function readableText(bg) {
  return contrast(bg, LIGHT_TEXT) >= contrast(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

export function shade([r, g, b], f) {
  const k = (v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
  return [k(r), k(g), k(b)];
}

export const css = ([r, g, b], a = 1) =>
  a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`;

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}
