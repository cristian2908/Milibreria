// Reglas para convertir el texto que lee Tesseract (líneas con tamaño, posición y
// confianza) en los campos del libro, sin IA. Funciones puras: se prueban en Node.
import { isbnsEnTexto, paginasEnTexto } from './completar.js';
// misma normalización que search.js (sin importarlo: aquí no hay JSX)
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// símbolos sueltos en los bordes de una palabra (se conserva la puntuación de frase: , . ; : ! ? ( ) « » ¿ ¡)
const BASURA = /^[|—–\-_"'“”·•*~^°[\]{}\\/<>=+]+|[|—–_"'“”·•*~^°[\]{}\\/<>=+]+$/gu;
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'van', 'von', 'da', 'dos', 'di', 'du', 'le']);
const EDITORIALES = [
  'Siglo Editorial', 'Siglo XXI', 'Universidad de los Andes', 'Universidad Nacional de Colombia', 'Universidad de Antioquia',
  'Editorial Gustavo Gili', 'Gustavo Gili', 'Planeta', 'Anagrama', 'Alfaguara', 'Penguin Random House', 'Random House',
  'Taurus', 'Debate', 'Paidós', 'Tusquets', 'Sexto Piso', 'Akal', 'Fondo de Cultura Económica', 'Norma', 'Panamericana',
  'Salamandra', 'Lumen', 'Debolsillo', 'Seix Barral', 'Crítica', 'Ariel', 'Gedisa', 'Siruela', 'Alianza Editorial', 'Cátedra',
  'Ediciones B', 'Destino', 'Espasa', 'Océano', 'Kairós', 'Herder', 'Blume', 'Taschen', 'Phaidon', "O'Reilly", 'Packt', 'Manning',
];
const VACIAS = new Set(['para', 'sobre', 'entre', 'desde', 'hacia', 'como', 'este', 'esta', 'estos', 'otros', 'otras', 'libro', 'libros']);

const letras = (s) => (s.match(/\p{L}/gu) || []).length;
const mediana = (xs) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : 0; };

/** Línea limpia: solo palabras confiables, sin símbolos sueltos en los bordes. */
export function infoLinea(l, minConf = 55) {
  const words = (l.words || [])
    .filter((w) => w.conf >= minConf)
    .map((w) => ({ ...w, text: String(w.text).replace(BASURA, '') }))
    .filter((w) => w.text && (letras(w.text) >= 1 || /\d/.test(w.text)))
    // letra mayúscula suelta al final de la línea: casi siempre ruido del borde
    .filter((w, i, arr) => !(i === arr.length - 1 && arr.length > 1 && /^\p{Lu}$/u.test(w.text) && w.conf < 90));
  const text = words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  // alto de la línea = caja de sus palabras confiables (sin guiones ni ruido alrededor)
  const conLetras = words.filter((w) => letras(w.text) >= 1);
  const h = conLetras.length ? Math.max(...conLetras.map((w) => w.bbox.y1)) - Math.min(...conLetras.map((w) => w.bbox.y0)) : l.bbox.y1 - l.bbox.y0;
  const noEsp = text.replace(/\s/g, '');
  return {
    text,
    h,
    y0: l.bbox.y0, y1: l.bbox.y1, x0: l.bbox.x0, x1: l.bbox.x1,
    conf: l.conf,
    ok: letras(text) >= 3 && noEsp.length > 0 && letras(text) / noEsp.length >= 0.7 && l.conf >= 55,
  };
}

/** ¿Parece un nombre de persona? («Daniel Bonilla Maldonado», «TOMÁS MALDONADO», «J. R. R. Tolkien») */
export function esNombre(text) {
  const ws = text.split(/\s+/).filter(Boolean);
  if (ws.length < 2 || ws.length > 5) return false;
  let partes = 0;
  for (const w of ws) {
    if (CONECTORES.has(w.toLowerCase())) continue;
    if (!/^\p{Lu}[\p{Ll}'’-]+\.?$/u.test(w) && !/^\p{Lu}{2,}$/u.test(w) && !/^(\p{Lu}\.)+$/u.test(w)) return false;
    partes++;
  }
  return partes >= 2;
}

function unir(lineas) {
  // une líneas y repara palabras cortadas con guion al final de línea
  let out = '';
  for (const t of lineas) {
    if (!out) { out = t; continue; }
    if (/\p{L}-$/u.test(out) && /^\p{Ll}/u.test(t)) out = out.slice(0, -1) + t;
    else out += ' ' + t;
  }
  return out.replace(/\s+([,.;:])/g, '$1').trim();
}

function cortarEnFrase(texto, max = 700) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('.\n'));
  return (fin > max * 0.4 ? corte.slice(0, fin + 1) : corte.replace(/\s+\S*$/, '') + '…').trim();
}

/** Título, subtítulo y autor desde la portada. */
export function camposPortada(lineas, textoContra = '') {
  const L = lineas.map((l) => infoLinea(l)).filter((l) => l.ok).sort((a, b) => a.y0 - b.y0);
  const contra = fold(textoContra);
  const nombres = L.filter((l) => esNombre(l.text))
    .map((l) => ({ l, s: (contra.includes(fold(l.text)) ? 2 : 0) + (l.conf >= 80 ? 1 : 0) }))
    .sort((a, b) => b.s - a.s || a.l.y0 - b.l.y0);
  const autor = nombres[0]?.l || null;
  const resto = L.filter((l) => l !== autor);
  if (!resto.length) return { titulo: null, subtitulo: null, autor: autor?.text || null };

  const maxH = Math.max(...resto.map((l) => l.h));
  const i0 = resto.findIndex((l) => l.h === maxH);
  let a = i0, b = i0;
  const junto = (p, q) => q.y0 - p.y1 <= Math.max(p.h, q.h) * 1.6;
  while (a > 0 && resto[a - 1].h >= maxH * 0.82 && junto(resto[a - 1], resto[a])) a--;
  while (b < resto.length - 1 && resto[b + 1].h >= maxH * 0.82 && junto(resto[b], resto[b + 1])) b++;
  const tLineas = resto.slice(a, b + 1).map((l) => l.text);
  let titulo = tLineas.length > 1 && tLineas[0].split(' ').length <= 2 ? `${tLineas[0]}: ${unir(tLineas.slice(1))}` : unir(tLineas);

  const sLineas = [];
  for (let k = b + 1; k < resto.length; k++) {
    const p = k === b + 1 ? resto[b] : resto[k - 1], q = resto[k];
    if (q.h < maxH * 0.35 || q.h >= maxH * 0.82 || !junto(p, q)) break;
    sLineas.push(q.text);
  }
  titulo = titulo.replace(/\s+/g, ' ').trim();
  return { titulo: titulo || null, subtitulo: sLineas.length ? unir(sLineas) : null, autor: autor?.text || null };
}

/** Resumen (párrafos principales) desde la contraportada. */
export function resumenContra(lineas) {
  const L = lineas.map((l) => infoLinea(l, 50)).filter((l) => l.ok && l.conf >= 85).sort((a, b) => a.y0 - b.y0);
  if (L.length < 2) return null;
  const hMed = mediana(L.map((l) => l.h));
  const cuerpo = L.filter((l) => l.h >= hMed * 0.7 && l.h <= hMed * 1.45);
  const salto = mediana(cuerpo.slice(1).map((l, i) => l.y0 - cuerpo[i].y0)) || hMed * 1.4;
  const parrafos = [[]];
  cuerpo.forEach((l, i) => {
    if (i && l.y0 - cuerpo[i - 1].y0 > salto * 1.6) parrafos.push([]);
    parrafos.at(-1).push(l.text);
  });
  // solo párrafos de verdad (3+ líneas seguidas): evita frases sueltas de contraportadas borrosas o a dos columnas
  const texto = parrafos.filter((p) => p.length >= 3).map((p) => unir(p)).join('\n\n');
  return texto.length >= 80 ? cortarEnFrase(texto) : null;
}

export function editorialEn(texto) {
  const t = fold(texto);
  for (const e of EDITORIALES) if (t.includes(fold(e))) return e;
  const m = /\b(?:Editorial|Ediciones|Editores)\s+\p{Lu}[\p{L}.&'’]*(?:\s+(?:\p{Lu}[\p{L}.&'’]*|de|del|y))*/u.exec(texto);
  return m ? m[0].replace(/\s+(de|del|y)$/u, '') : null;
}

/** Categorías existentes cuyas palabras clave aparecen en el texto (máx. 3). */
export function categoriasEn(texto, categorias = []) {
  const t = fold(texto);
  const out = [];
  for (const c of categorias) {
    const claves = fold(c).split(/[^a-zñ]+/).filter((w) => w.length >= 5 && !VACIAS.has(w));
    if (!claves.length) continue;
    // la mayoría de sus palabras clave (raíz) debe aparecer: «Derecho y filosofía» sí, «Arte y cultura visual» por solo «cultura» no
    const hits = claves.filter((w) => t.includes(w.slice(0, Math.max(5, w.length - 2)))).length;
    if (hits / claves.length > 0.5) out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Arma el resultado con el mismo formato que la lectura con IA.
 * @param portada  líneas de Tesseract de la portada ({text, conf, bbox, words})
 * @param contra   líneas de la contraportada (o [])
 * @param codigos  textos de códigos de barras/QR leídos (ISBN en EAN-13 o en una URL)
 */
export function camposDesdeOCR({ portada = [], contra = [], codigos = [], categorias = [] }) {
  const lineaTexto = (ls, minConf) => ls.map((l) => infoLinea(l, minConf)).filter((l) => l.ok).map((l) => l.text);
  const textoPortada = lineaTexto(portada, 60).join('\n');
  const textoContra = lineaTexto(contra, 50).join('\n');
  const todo = `${textoPortada}\n${textoContra}`;
  const { titulo, subtitulo, autor } = camposPortada(portada, textoContra);
  const isbn = isbnsEnTexto(codigos.join('\n'))[0] || isbnsEnTexto(todo)[0] || null;
  const confianza = titulo && (autor || isbn) ? 'media' : 'baja';
  return {
    titulo, subtitulo, autor,
    editorial: editorialEn(todo),
    isbn,
    paginas: paginasEnTexto(todo),
    descripcion: resumenContra(contra),
    categorias: categoriasEn(todo, categorias),
    confianza,
    recorte_portada: null, recorte_contraportada: null,
    texto_visible: [textoPortada, textoContra].filter(Boolean).join('\n\n').slice(0, 2000) || null,
    _proveedor: 'tesseract',
  };
}
