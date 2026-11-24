import { useEffect, useMemo, useState } from 'react';
import { sampleSpineColor, colorFromString, parseColor, readableText } from './color.js';

const cache = new Map();
const keyOf = (b) => `${b.cover || ''}|${b.spineColor || ''}|${b.title}`;

/**
 * Carga todas las portadas y devuelve { [id]: { aspect, spine, text, ready } }.
 * - aspect: ancho/alto real de la imagen (define el alto del libro)
 * - spine:  RGB del lomo (color manual > muestreo de la portada > hash del título)
 * - text:   color legible sobre ese lomo
 * Se calcula en el estante (no en cada libro) porque el alto de cada libro
 * afecta el layout de todo el estante.
 */
export function useCoverInfos(books) {
  const [infos, setInfos] = useState(() => initial(books));
  const signature = books.map(keyOf).join('§');

  useEffect(() => {
    let alive = true;
    setInfos(initial(books));
    books.forEach((book) => {
      const key = keyOf(book);
      if (cache.has(key)) return;
      loadInfo(book).then((info) => {
        cache.set(key, info);
        if (alive) setInfos((prev) => ({ ...prev, [book.id]: info }));
      });
    });
    return () => { alive = false; };
  }, [signature]);

  // Libros recién agregados aún no tienen entrada: usar caché o respaldo en el mismo render
  return useMemo(() => {
    const out = {};
    for (const b of books) out[b.id] = infos[b.id] || cache.get(keyOf(b)) || fallback(b);
    return out;
  }, [books, infos]);
}

function initial(books) {
  const out = {};
  for (const b of books) out[b.id] = cache.get(keyOf(b)) || fallback(b);
  return out;
}

function loadInfo(book) {
  return new Promise((resolve) => {
    if (!book.cover) return resolve({ ...fallback(book), ready: true });
    const img = new Image();
    img.crossOrigin = 'anonymous'; // portadas de otro dominio necesitan CORS para leer el color
    img.decoding = 'async';
    img.onload = () => {
      let spine = parseColor(book.spineColor);
      if (!spine) {
        try { spine = sampleSpineColor(img); } catch { spine = null; }
      }
      spine = spine || colorFromString(book.title);
      resolve({
        aspect: book.aspect || img.naturalWidth / img.naturalHeight,
        spine,
        text: readableText(spine),
        ready: true,
      });
    };
    img.onerror = () => resolve({ ...fallback(book), ready: true, broken: true });
    img.src = book.cover;
  });
}

function fallback(book) {
  const spine = parseColor(book.spineColor) || colorFromString(book.title);
  return { aspect: book.aspect, spine, text: readableText(spine), ready: false };
}
