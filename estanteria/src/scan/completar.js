// Completa y valida los datos que devuelve el modelo usando el texto que leyó de las fotos.
// Copia en CommonJS dentro de api/estanteria-routes.js (mantener iguales).

/** Valida un ISBN-10 o ISBN-13 (dígito de control). Devuelve el ISBN limpio o null. */
export function isbnValido(v) {
  const s = String(v || '').replace(/[^\dXx]/g, '').toUpperCase();
  if (s.length === 13 && /^\d{13}$/.test(s)) {
    const sum = [...s].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? s : null;
  }
  if (s.length === 10 && /^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((acc, d, i) => acc + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    return sum % 11 === 0 ? s : null;
  }
  return null;
}

/** Todos los ISBN válidos que aparecen en un texto (ISBN-13 primero). */
export function isbnsEnTexto(texto) {
  const out = [];
  const re = /(?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx]/g;
  for (const m of String(texto || '').matchAll(re)) {
    const ok = isbnValido(m[0]);
    if (ok && !out.includes(ok)) out.push(ok);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Número de páginas impreso («320 páginas», «256 págs.», «198 pp.», «400 pages»). */
export function paginasEnTexto(texto) {
  const m = /(\d{2,4})\s*(?:p[áa]ginas|p[áa]gs?\.?|pp\.?|pages)\b/i.exec(String(texto || ''));
  const n = m ? Number(m[1]) : NaN;
  return n >= 10 && n <= 5000 ? n : null;
}

/**
 * Revisa la respuesta del modelo: ISBN con dígito de control válido (o el que esté
 * en el texto leído), páginas desde el texto si faltan, y textos recortados.
 */
export function completarDesdeTexto(r) {
  const out = { ...(r || {}) };
  const texto = typeof out.texto_visible === 'string' ? out.texto_visible.slice(0, 4000) : '';
  out.texto_visible = texto || null;
  out.isbn = isbnValido(out.isbn) || isbnsEnTexto(texto)[0] || null;
  const pag = Number(out.paginas);
  out.paginas = pag >= 10 && pag <= 5000 ? Math.round(pag) : paginasEnTexto(texto);
  for (const k of ['titulo', 'subtitulo', 'autor', 'editorial', 'descripcion']) {
    if (typeof out[k] === 'string') out[k] = out[k].replace(/\s+/g, ' ').trim() || null;
  }
  return out;
}
