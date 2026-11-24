// Categorías y búsqueda de la estantería.
import { normFormat, normStatus } from './bookshelf/status.js';
import { categoryAliases } from './i18n.jsx';

/** Categorías base. Las que crees se suman a esta lista. */
export const DEFAULT_CATEGORIES = [
  'Diseño',
  'UX e interacción',
  'Tipografía y retícula',
  'Color',
  'Sostenibilidad',
  'Biomimética',
  'Arte y cultura visual',
  'Materiales y procesos',
  'Referencia',
];

/** Minúsculas, sin tildes ni espacios dobles: "Diseño" ≈ "diseno" */
export const fold = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function cleanCategory(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** Lista de categorías: base + las usadas en los libros, sin duplicados (ignora tildes). */
export function allCategories(books) {
  const seen = new Map();
  for (const c of DEFAULT_CATEGORIES) seen.set(fold(c), c);
  for (const b of books || []) for (const c of b.categories || []) if (c && !seen.has(fold(c))) seen.set(fold(c), c);
  return [...seen.values()];
}

/** Color estable por categoría (para los chips) */
export function categoryHue(name) {
  let h = 0;
  const s = fold(name);
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 360;
  return h;
}

// Etiquetas en i18n.jsx: scope.<clave> y sort.<clave>
export const SEARCH_FIELDS = ['todo', 'titulo', 'autor', 'categoria', 'notas'];
export const SORTS = ['estante', 'titulo', 'autor', 'paginas', 'estado'];

/** Campos buscables de un libro: [clave de etiqueta (hit.*), texto, página] */
function fieldsOf(book) {
  const notes = Array.isArray(book.notes) ? book.notes : [];
  return {
    titulo: [['title', book.title]],
    autor: [['author', book.author]],
    // la categoría se encuentra por su nombre guardado y por su traducción
    categoria: (book.categories || []).flatMap((c) => [['category', c], ...categoryAliases(c).map((a) => ['category', a])]),
    notas: [
      ['summary', book.note],
      ...notes.map((n) => ['note', n.text, n.page || null]),
    ],
    otros: [
      ['publisher', book.publisher],
      ['isbn', book.isbn],
      ['description', book.description],
    ],
  };
}

function snippet(text, start, len) {
  const s = String(text);
  if (s.length <= 90) return s;
  const a = Math.max(0, start - 30);
  const b = Math.min(s.length, start + len + 50);
  return (a > 0 ? '…' : '') + s.slice(a, b).trim() + (b < s.length ? '…' : '');
}

/**
 * ¿Coincide el libro con la búsqueda?
 * Todas las palabras deben aparecer (en cualquier campo del ámbito elegido).
 * Devuelve null o { hits: [{ label, page, text, field }] } con dónde coincidió (label = clave hit.*).
 */
export function matchBook(book, query, scope = 'todo') {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return { hits: [] };
  const groups = fieldsOf(book);
  const keys = scope === 'todo' ? Object.keys(groups) : [scope];
  const entries = keys.flatMap((k) => groups[k].map(([label, text, page]) => ({ label, page, text: String(text ?? ''), field: k })))
    .filter((e) => e.text);
  const folded = entries.map((e) => fold(e.text));
  const hits = [];
  for (const w of words) {
    const i = folded.findIndex((f) => f.includes(w));
    if (i < 0) return null;
    const e = entries[i];
    if (!hits.some((h) => h.label === e.label && h.raw === e.text)) {
      hits.push({ label: e.label, page: e.page, field: e.field, raw: e.text, text: snippet(e.text, folded[i].indexOf(w), w.length) });
    }
  }
  return { hits };
}

const STATUS_ORDER = { leyendo: 0, pendiente: 1, leido: 2 };

/** Aplica búsqueda, filtros y orden. Devuelve { list, hitsById }. */
export function applyFilters(books, { query, scope, format, status, cats, sort }) {
  const hitsById = {};
  const catSet = new Set((cats || []).map(fold));
  let list = (books || []).filter((b) => {
    if (format !== 'todos' && normFormat(b.format) !== format) return false;
    if (status !== 'todos' && normStatus(b.readStatus) !== status) return false;
    if (catSet.size) {
      const mine = new Set((b.categories || []).map(fold));
      for (const c of catSet) if (!mine.has(c)) return false; // todas las categorías elegidas
    }
    if (query && query.trim()) {
      const m = matchBook(b, query, scope);
      if (!m) return false;
      hitsById[b.id] = m.hits;
    }
    return true;
  });
  const by = (f) => (a, b) => fold(f(a)).localeCompare(fold(f(b)), 'es');
  if (sort === 'titulo') list = [...list].sort(by((x) => x.title));
  else if (sort === 'autor') list = [...list].sort(by((x) => x.author));
  else if (sort === 'paginas') list = [...list].sort((a, b) => (b.pages || 0) - (a.pages || 0));
  else if (sort === 'estado') list = [...list].sort((a, b) => STATUS_ORDER[normStatus(a.readStatus)] - STATUS_ORDER[normStatus(b.readStatus)]);
  return { list, hitsById };
}
