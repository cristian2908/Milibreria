// Geometría física del libro.
// Conceptos tomados como referencia de comportamiento de mawise/bookshelf (MIT):
//   alto = ancho / relación de aspecto de la portada
//   grosor = k · páginas^0.6 (curva no lineal contenida)
// Reimplementado desde cero; ver NOTICE.md.

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Ancho de portada de referencia (px). El resto escala a partir de aquí. */
export const BASE_COVER_WIDTH = 150;

/** Relación ancho/alto por defecto (libro de bolsillo ~ 2:3). */
export const DEFAULT_ASPECT = 2 / 3;

/** Alto del libro a partir de la relación de aspecto de su portada. */
export function bookHeight(coverWidth, aspect) {
  const a = clamp(Number(aspect) || DEFAULT_ASPECT, 0.5, 1.1);
  return Math.round(coverWidth / a);
}

/**
 * Grosor del lomo a partir del número de páginas.
 * Exponente 0.6: un libro de 600 págs. no es el doble de grueso que uno de 300
 * a ojo, y así los tomos gigantes no dominan el estante.
 */
export function bookThickness(pages, coverWidth) {
  const p = clamp(Number(pages) || 300, 24, 2000);
  const k = 0.85 * (coverWidth / 200);
  return Math.round(clamp(k * Math.pow(p, 0.6), 8, coverWidth * 0.42));
}

/** Calcula posiciones X de cada libro en el estante. */
export function layoutShelf(books, coverWidth, gap = 2) {
  let x = 0;
  let maxH = 0;
  const slots = books.map((b) => {
    const h = bookHeight(coverWidth, b.aspect);
    const t = bookThickness(b.pages, coverWidth);
    const slot = { id: b.id, x, width: t, height: h };
    x += t + gap;
    maxH = Math.max(maxH, h);
    return slot;
  });
  return { slots, totalWidth: Math.max(0, x - gap), maxHeight: maxH };
}
