// Adaptador entre la API de Mi Biblioteca (/api/libros) y la estantería.
// Requiere las migraciones 002, 003 y 004 de api/migrations.
import { normFormat, normStatus } from '../bookshelf/status.js';

const API = import.meta.env.VITE_API_URL || '/api';

/** Categorías: columna TEXT[] `categorias`; si está vacía, usa el `genero` antiguo ("Diseño, UX") */
export function normCategories(list, genero) {
  let arr = Array.isArray(list) ? list : typeof list === 'string' && list.startsWith('{')
    ? list.slice(1, -1).split(',').map((x) => x.replace(/^"|"$/g, '')) : [];
  if (!arr.length && genero) arr = String(genero).split(/[,;/]/);
  const seen = new Set();
  return arr.map((c) => String(c).trim()).filter((c) => {
    const k = c.toLowerCase();
    if (!c || seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 12);
}

/** Notas del libro: [{ id, text, page, date }] (columna JSONB `notas`) */
export function normNotes(v) {
  let list = v;
  if (typeof v === 'string') { try { list = JSON.parse(v); } catch { list = []; } }
  if (!Array.isArray(list)) return [];
  return list
    .filter((n) => n && String(n.text ?? n.texto ?? '').trim())
    .map((n, i) => ({
      id: String(n.id || `n${i}`),
      text: String(n.text ?? n.texto).slice(0, 800),
      page: n.page ?? n.pagina ?? null,
      date: n.date ?? n.fecha ?? null,
    }));
}

/** Fila de PostgreSQL → libro de la estantería */
export function fromLibro(row) {
  return {
    id: String(row.id),
    title: row.titulo || 'Sin título',
    author: row.autor || '',
    cover: row.portada_url || '',
    backCover: row.contraportada_url || '',
    isbn: row.isbn || '',
    publisher: row.editorial || '',
    pages: row.paginas || null,
    description: row.descripcion || '',
    spineColor: row.color_lomo || '',
    aspect: row.portada_ratio || null,
    format: normFormat(row.formato),
    readStatus: normStatus(row.estado_lectura),
    note: row.nota_resumen || '',
    notes: normNotes(row.notas),
    categories: normCategories(row.categorias, row.genero),
    // datos propios de la app que se conservan para otras vistas
    meta: { genero: row.genero, prio: row.prio, quien: row.quien, comprado: row.comprado, nota: row.nota },
  };
}

/** Cambios de la estantería → cuerpo para PUT /api/libros/:id */
export function toLibroPatch(patch) {
  const out = {};
  if ('format' in patch) out.formato = patch.format;
  if ('readStatus' in patch) out.estado_lectura = patch.readStatus;
  if ('note' in patch) out.nota_resumen = patch.note;
  if ('notes' in patch) out.notas = normNotes(patch.notes);
  if ('categories' in patch) out.categorias = normCategories(patch.categories);
  return out;
}

const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

export async function fetchLibros(token) {
  const res = await fetch(`${API}/libros`, { headers: auth(token) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data) ? data : data.libros || data.rows || [];
  return rows.map(fromLibro);
}

export async function updateLibro(id, patch, token) {
  const res = await fetch(`${API}/libros/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth(token) },
    body: JSON.stringify(toLibroPatch(patch)),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json().catch(() => ({}));
}

/** Libro nuevo de la estantería → cuerpo para POST /api/libros */
export function toLibroRow(b) {
  return {
    titulo: b.title, autor: b.author || '', descripcion: b.description || '',
    paginas: b.pages || null, formato: b.format, estado_lectura: b.readStatus,
    nota_resumen: b.note || '', notas: normNotes(b.notes), categorias: normCategories(b.categories), portada_url: b.cover || '', contraportada_url: b.backCover || '',
    portada_ratio: b.aspect || null, isbn: b.isbn || null, editorial: b.publisher || null,
    via_foto: !!b.viaFoto,
  };
}

/** Sube una imagen (data URL JPEG) y devuelve su URL pública en /portadas/ */
export async function uploadImagen(dataUrl, token) {
  const res = await fetch(`${API}/portadas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(token) },
    body: JSON.stringify({ imagen: dataUrl }),
  });
  if (!res.ok) throw new Error(`Subida ${res.status}`);
  return (await res.json()).url;
}

export async function createLibro(book, token) {
  const body = { ...book };
  if (body.cover?.startsWith('data:')) body.cover = await uploadImagen(body.cover, token);
  if (body.backCover?.startsWith('data:')) body.backCover = await uploadImagen(body.backCover, token);
  const res = await fetch(`${API}/libros`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth(token) },
    body: JSON.stringify(toLibroRow(body)),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const row = await res.json();
  return fromLibro(row.libro || row);
}

export async function deleteLibro(id, token) {
  const res = await fetch(`${API}/libros/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(token) });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

// ── Modo demo: los cambios se guardan solo en este navegador ──────────────
const LS_OWN = 'mi-biblioteca.estanteria.propios.v1';

export function loadOwnBooks() {
  try { return JSON.parse(localStorage.getItem(LS_OWN) || '[]'); } catch { return []; }
}

/** Devuelve false si el navegador no tiene espacio (fotos muy pesadas). */
export function saveOwnBooks(list) {
  try { localStorage.setItem(LS_OWN, JSON.stringify(list)); return true; } catch { return false; }
}

const LS_KEY = 'mi-biblioteca.estanteria.v1';

export function loadLocalEdits() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

export function saveLocalEdit(id, patch) {
  try {
    const all = loadLocalEdits();
    all[id] = { ...all[id], ...patch };
    localStorage.setItem(LS_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}
