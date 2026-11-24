// Prototipo funcional: la estantería guardada en la base de datos del artifact (capacidad `db`)
// y las fotos en su almacén de imágenes (capacidad `assets`).
//
//   libros/<id>   un documento por libro (ver toDoc / fromDoc)
//
// Reglas declaradas: todos los que abren el enlace leen; solo dueño y editores escriben.
import { coverFromSpec, demoSeedDocs } from '../data/demoBooks.js';
import { normNotes, normCategories } from '../api/libros.js';
import { normFormat, normStatus } from '../bookshelf/status.js';

const COL = 'libros';

/** Conecta con la base, el almacén y el usuario. null si esta vista no puede guardar en la nube. */
export async function connectCloud() {
  if (typeof window === 'undefined' || !window.claude?.use) return null;
  try {
    const [db, assets, user] = await Promise.all([
      window.claude.use('db'),
      window.claude.use('assets').catch(() => null),
      window.claude.use('user').catch(() => null),
    ]);
    if (!db) return null;
    let canEdit = null;
    try { canEdit = user ? await user.canEdit() : null; } catch { canEdit = null; }
    let canWrite = null;
    try { canWrite = user ? await user.can('data.write') : null; } catch { canWrite = null; }
    // El dueño y los editores escriben (regla write: admin)
    const editor = canEdit === true || (canEdit == null && canWrite !== false);
    return { db, assets, user, editor, canUpload: !!assets };
  } catch {
    return null;
  }
}

const blobUrl = (id) => (id ? `/_blob/${id}` : '');

/** Documento → libro de la estantería */
export function fromDoc(snap) {
  const d = snap.data() || {};
  const cover = d.coverAsset ? blobUrl(d.coverAsset)
    : d.coverSpec ? coverFromSpec(d.coverSpec, d.title || '', d.author || '') : '';
  return {
    id: snap.id,
    title: String(d.title || 'Sin título'),
    author: String(d.author || ''),
    cover,
    backCover: d.backAsset ? blobUrl(d.backAsset) : '',
    coverAsset: d.coverAsset || null,
    backAsset: d.backAsset || null,
    pages: Number(d.pages) || null,
    description: String(d.description || ''),
    spineColor: d.spineColor || '',
    aspect: Number(d.aspect) || null,
    format: normFormat(d.format),
    readStatus: normStatus(d.readStatus),
    note: String(d.note || ''),
    notes: normNotes(d.notes),
    categories: normCategories(d.categories),
    isbn: String(d.isbn || ''),
    publisher: String(d.publisher || ''),
    order: Number(d.order) || 0,
    demo: !!d.demo,
  };
}

/** Campos de la estantería que se guardan tal cual */
const FIELDS = ['title', 'author', 'pages', 'description', 'note', 'format', 'readStatus', 'isbn', 'publisher', 'aspect', 'spineColor'];

function cleanPatch(patch) {
  const out = {};
  for (const k of FIELDS) if (k in patch) out[k] = patch[k] ?? null;
  if ('notes' in patch) out.notes = normNotes(patch.notes);
  if ('categories' in patch) out.categories = normCategories(patch.categories);
  if ('readStatus' in patch) out.readAt = patch.readStatus === 'leido' ? new Date().toISOString().slice(0, 10) : null;
  return out;
}

/**
 * Suscripción a todos los libros, en orden de estante.
 * onState({ books, loading, stale, error })
 */
export function subscribeBooks(cloud, onState) {
  let gotFresh = false;
  const timer = setTimeout(() => { if (!gotFresh) onState({ stale: true }); }, 10000);
  const unsub = cloud.db.collection(COL).onSnapshot(
    (snap) => {
      const books = snap.docs.filter((d) => d.exists).map(fromDoc).sort((a, b) => a.order - b.order);
      if (!snap.metadata.fromCache) { gotFresh = true; clearTimeout(timer); }
      onState(gotFresh ? { books, loading: false, stale: false } : { books, loading: false });
    },
    (e) => { clearTimeout(timer); onState({ error: e?.code || 'unavailable', loading: false }); }
  );
  return () => { clearTimeout(timer); unsub(); };
}

// ── Escrituras: una a la vez por documento, juntando cambios seguidos ─────
const pending = new Map(); // id -> patch acumulado
const running = new Map(); // id -> promesa en curso

export function updateBook(cloud, id, patch) {
  pending.set(id, { ...pending.get(id), ...cleanPatch(patch) });
  if (running.has(id)) return running.get(id);
  const run = (async () => {
    try {
      while (pending.has(id)) {
        const p = pending.get(id);
        pending.delete(id);
        await cloud.db.doc(`${COL}/${id}`).update({ ...p, updatedAt: Date.now() });
      }
    } finally { running.delete(id); }
  })();
  running.set(id, run);
  return run;
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadIfData(cloud, src) {
  if (!src || !String(src).startsWith('data:')) return null;
  if (!cloud.assets) throw Object.assign(new Error('No tienes permiso para subir fotos en esta estantería.'), { code: 'no_upload' });
  const res = await cloud.assets.upload(dataUrlToBlob(src));
  return res.id;
}

/** Crea un libro: sube las fotos y escribe el documento. Devuelve el libro. */
export async function createBook(cloud, book, { order } = {}) {
  const coverAsset = await uploadIfData(cloud, book.cover);
  const backAsset = await uploadIfData(cloud, book.backCover);
  const ref = cloud.db.collection(COL).doc();
  const doc = {
    ...cleanPatch(book),
    notes: normNotes(book.notes),
    categories: normCategories(book.categories),
    coverAsset, backAsset,
    viaFoto: !!book.viaFoto,
    order: order ?? Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await ref.set(doc);
  return fromDoc({ id: ref.id, data: () => doc });
}

/** Elimina el libro y sus fotos (acción explícita del usuario). */
export async function deleteBook(cloud, book) {
  await cloud.db.doc(`${COL}/${book.id}`).delete();
  for (const a of [book.coverAsset, book.backAsset]) {
    if (a && cloud.assets) { try { await cloud.assets.delete(a); } catch { /* la foto puede quedar huérfana */ } }
  }
}

/** Carga los 10 libros de ejemplo (portadas generadas, sin fotos). */
export async function seedDemo(cloud) {
  for (const { _demoId, ...d } of demoSeedDocs()) {
    await cloud.db.doc(`${COL}/demo-${_demoId}`).set({ ...d, createdAt: Date.now(), updatedAt: Date.now() });
  }
}

export async function removeDemo(cloud, books) {
  for (const b of books.filter((x) => x.demo)) await cloud.db.doc(`${COL}/${b.id}`).delete();
}

/** Sube a la nube los libros que estaban guardados solo en este navegador. */
export async function importLocal(cloud, localBooks, onProgress) {
  let n = 0;
  for (const b of localBooks) {
    await createBook(cloud, b, { order: Date.now() + n });
    n++; onProgress?.(n);
  }
  return n;
}
