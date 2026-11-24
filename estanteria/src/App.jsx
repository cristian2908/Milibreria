import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookshelf, FORMATS, READ_STATUS, normFormat, normStatus } from './bookshelf/index.js';
import { buildDemoBooks } from './data/demoBooks.js';
import {
  fetchLibros, updateLibro, createLibro, deleteLibro,
  loadLocalEdits, saveLocalEdit, loadOwnBooks, saveOwnBooks,
} from './api/libros.js';
import AddBookSheet from './components/AddBookSheet.jsx';
import { connectCloud, subscribeBooks, updateBook, createBook, deleteBook, seedDemo, removeDemo, importLocal } from './store/cloud.js';
import CategoryPicker from './components/CategoryPicker.jsx';
import { allCategories, applyFilters, categoryHue, fold, SEARCH_FIELDS, SORTS } from './search.js';
import { useI18n } from './i18n.jsx';
import FloatControls from './components/FloatControls.jsx';

const SOURCE = import.meta.env.VITE_SOURCE || 'demo'; // 'demo' | 'api'

const STEPS = [
  { key: null, label: 'steps.shelf' },
  { key: 'front', label: 'steps.front' },
  { key: 'inside', label: 'steps.inside' },
  { key: 'back', label: 'steps.back' },
];

function getToken() {
  try { return localStorage.getItem('token') || ''; } catch { return ''; }
}

function demoBooks() {
  const edits = loadLocalEdits();
  const own = loadOwnBooks().map((b) => ({ ...b, own: true }));
  return [...buildDemoBooks(), ...own].map((b) => ({ ...b, ...edits[b.id] }));
}

export default function App() {
  const { t, cat } = useI18n();
  const [rawBooks, setBooks] = useState(null);
  const [mode, setMode] = useState(SOURCE === 'api' ? 'api' : 'connecting'); // connecting | cloud | api | local
  const cloudRef = useRef(null);
  const [cloudInfo, setCloudInfo] = useState({ editor: true, canUpload: true });
  const [cloudState, setCloudState] = useState({ stale: false, error: '' });
  const [overrides, setOverrides] = useState({}); // cambios aún no confirmados por la base
  const [error, setError] = useState('');
  const [selection, setSelection] = useState({ id: null, face: null });
  const [fFormat, setFFormat] = useState('todos');
  const [fStatus, setFStatus] = useState('todos');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('todo');
  const [cats, setCats] = useState([]);
  const [sort, setSort] = useState('estante');
  const [save, setSave] = useState(''); // '' | 'guardando' | 'guardado' | 'error'
  const noteTimers = useRef({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [goto, setGoto] = useState(null);
  const usingApi = mode === 'api' && !error;
  const isCloud = mode === 'cloud';
  const canEdit = !isCloud || cloudInfo.editor;

  const books = useMemo(
    () => (rawBooks && isCloud ? rawBooks.map((b) => (overrides[b.id] ? { ...b, ...overrides[b.id] } : b)) : rawBooks),
    [rawBooks, overrides, isCloud]
  );

  useEffect(() => {
    if (SOURCE === 'api') {
      fetchLibros(getToken()).then(setBooks).catch((e) => { setError(e.message); setMode('local'); setBooks(demoBooks()); });
      return undefined;
    }
    let alive = true;
    let unsub = null;
    connectCloud().then((cloud) => {
      if (!alive) return;
      if (!cloud) { setMode('local'); setBooks(demoBooks()); return; }
      cloudRef.current = cloud;
      setCloudInfo({ editor: cloud.editor, canUpload: cloud.canUpload });
      setMode('cloud');
      unsub = subscribeBooks(cloud, (st) => {
        if (st.books) setBooks(st.books);
        setCloudState((c) => ({
          ...c,
          ...(st.stale !== undefined ? { stale: st.stale } : {}),
          ...(st.error ? { error: st.error } : {}),
        }));
      });
    });
    return () => { alive = false; unsub?.(); };
  }, []);

  // ── Guardar cambios ────────────────────────────────────────────────────
  const persist = useCallback(async (id, patch) => {
    setSave('guardando');
    try {
      if (isCloud) await updateBook(cloudRef.current, id, patch);
      else if (usingApi) await updateLibro(id, patch, getToken());
      else if (!saveLocalEdit(id, patch)) throw new Error('sin almacenamiento');
      setSave('guardado');
    } catch { setSave('error'); }
    if (isCloud) {
      // la base ya lo tiene: quitar del override lo que no cambió desde entonces
      setOverrides((o) => {
        const cur = o[id];
        if (!cur) return o;
        const next = { ...cur };
        for (const k of Object.keys(patch)) if (next[k] === patch[k]) delete next[k];
        const out = { ...o };
        if (Object.keys(next).length) out[id] = next; else delete out[id];
        return out;
      });
    }
  }, [isCloud, usingApi]);

  const update = useCallback((id, patch, { debounce = false } = {}) => {
    if (isCloud) setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
    else setBooks((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    clearTimeout(noteTimers.current[id]);
    if (debounce) {
      setSave('guardando');
      noteTimers.current[id] = setTimeout(() => persist(id, patch), 700);
    } else persist(id, patch);
  }, [persist, isCloud]);

  // ── Agregar y eliminar ─────────────────────────────────────────────────
  const addBook = useCallback(async (book) => {
    let saved = book;
    if (isCloud) {
      try {
        saved = await createBook(cloudRef.current, book);
      } catch (e) {
        throw new Error(e?.code === 'quota_exceeded' ? t('err.dbFull') : e?.code === 'no_upload' ? t('err.noUpload') : e?.message || t('err.cloudSave'));
      }
    } else if (usingApi) {
      saved = await createLibro(book, getToken());
    } else {
      const own = [...loadOwnBooks(), book];
      if (!saveOwnBooks(own)) throw new Error(t('err.localFull'));
      saved = { ...book, own: true };
    }
    if (!isCloud) setBooks((list) => [...list, saved]);
    clearFilters();
    setReveal({ id: saved.id, n: Date.now() });
  }, [usingApi, isCloud, t]);

  const removeBook = useCallback(async (book) => {
    if (isCloud) { await deleteBook(cloudRef.current, book); return; }
    if (usingApi) await deleteLibro(book.id, getToken());
    else saveOwnBooks(loadOwnBooks().filter((b) => b.id !== book.id));
    setBooks((list) => list.filter((b) => b.id !== book.id));
  }, [usingApi, isCloud]);

  // ── Filtros y conteos ──────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { total: 0, fisico: 0, virtual: 0, pendiente: 0, leyendo: 0, leido: 0 };
    for (const b of books || []) {
      c.total++; c[normFormat(b.format)]++; c[normStatus(b.readStatus)]++;
    }
    return c;
  }, [books]);

  const categories = useMemo(() => allCategories(books), [books]);
  const catCounts = useMemo(() => {
    const m = {};
    for (const b of books || []) for (const c of b.categories || []) m[fold(c)] = (m[fold(c)] || 0) + 1;
    return m;
  }, [books]);

  const { list: visible, hitsById } = useMemo(
    () => applyFilters(books, { query, scope, format: fFormat, status: fStatus, cats, sort }),
    [books, query, scope, fFormat, fStatus, cats, sort]
  );

  const anyActive = !!query.trim() || cats.length > 0 || scope !== 'todo' || fFormat !== 'todos' || fStatus !== 'todos' || sort !== 'estante';
  const shownCats = categories.filter((c) => catCounts[fold(c)] || cats.some((x) => fold(x) === fold(c)));
  function clearFilters() {
    setQuery(''); setScope('todo'); setCats([]); setFFormat('todos'); setFStatus('todos'); setSort('estante');
  }
  const activeChips = [];
  if (scope !== 'todo') activeChips.push({ k: 'scope', label: `${t('filters.in')}: ${t(`scope.${scope}`)}`, clear: () => setScope('todo') });
  if (fFormat !== 'todos') activeChips.push({ k: 'format', label: t(`format.${fFormat}`), clear: () => setFFormat('todos') });
  if (fStatus !== 'todos') activeChips.push({ k: 'status', label: t(`status.${fStatus}`), dot: READ_STATUS[fStatus]?.color, clear: () => setFStatus('todos') });
  for (const c of cats) activeChips.push({ k: `cat-${c}`, label: cat(c), dot: `hsl(${categoryHue(c)} 55% 62%)`, clear: () => setCats((cur) => cur.filter((x) => fold(x) !== fold(c))) });
  if (sort !== 'estante') activeChips.push({ k: 'sort', label: `${t('filters.order')}: ${t(`sortShort.${sort}`)}`, clear: () => setSort('estante') });
  const focusSearch = () => {
    const input = document.querySelector('.search input');
    if (!input) return;
    input.closest('.filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    input.focus({ preventScroll: true });
  };
  const toggleCat = (c) => setCats((cur) => (cur.some((x) => fold(x) === fold(c)) ? cur.filter((x) => fold(x) !== fold(c)) : [...cur, c]));
  const showBook = (id) => {
    document.querySelector('.shelf-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setReveal({ id, n: Date.now() });
  };

  const book = books?.find((b) => b.id === selection.id) || null;
  const face = selection.face;
  const hint = t(!book ? 'hint.none' : face === 'front' ? 'hint.front' : face === 'inside' ? 'hint.inside' : 'hint.back');

  return (
    <main className="app">
      <header className="app-head">
        <div className="eyebrow-row">
          <p className="eyebrow">{t('app.eyebrow')}</p>
        </div>
        <div className="title-row">
          <h1>{t('app.title')}</h1>
          {canEdit && mode !== 'connecting' ? <button type="button" className="add-btn" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            {t('app.add')}
          </button> : null}
        </div>
        <SyncBar
          mode={mode} cloudState={cloudState} canEdit={canEdit}
          books={books} cloud={cloudRef}
          onAdd={() => setSheetOpen(true)}
        />
        {books?.length ? (
          <p className="lede">
            {t('count.formats', counts)}<br />
            <span className="lede-read">{t('count.status', counts)}</span>
          </p>
        ) : null}
        {books && counts.total ? (
          <div className="progress" role="img" aria-label={t('count.readPct', { p: Math.round((counts.leido / counts.total) * 100) })}>
            <span style={{ width: `${(counts.leido / counts.total) * 100}%`, background: READ_STATUS.leido.color }} />
            <span style={{ width: `${(counts.leyendo / counts.total) * 100}%`, background: READ_STATUS.leyendo.color }} />
          </div>
        ) : null}
      </header>

      {books?.length ? <nav className="filters" aria-label={t('search.aria')}>
        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); e.currentTarget.querySelector('input')?.blur(); }}>
          <svg className="search-ico" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={scope === 'todo' ? t('search.placeholder') : t('search.placeholderBy', { field: t(`scope.${scope}`) })}
            aria-label={t('search.input')} enterKeyHint="search" autoComplete="off"
          />
          {query ? (
            <button type="button" className="search-clear" aria-label={t('search.clear')} onClick={() => setQuery('')}>
              <svg width="12" height="12" viewBox="0 0 18 18"><path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            </button>
          ) : null}
        </form>

        <div className="filter-bar">
          <span className="result-count" aria-live="polite">
            {books ? (anyActive ? t('count.of', { n: visible.length, total: counts.total }) : t('count.books', { n: counts.total })) : ''}
          </span>
          {anyActive ? <button type="button" className="link" onClick={clearFilters}>{t('filters.clear')}</button> : null}
        </div>
        {activeChips.length ? (
          <ul className="active-filters" aria-label={t('active.aria')}>
            {activeChips.map((c) => (
              <li key={c.k}>
                <button type="button" className="af-chip" onClick={c.clear} aria-label={t('active.remove', { x: c.label })}>
                  {c.dot ? <span className="chip-dot" style={{ background: c.dot }} aria-hidden="true" /> : null}
                  {c.label}
                  <svg width="10" height="10" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {query.trim() && visible.length ? (
          <ul className="results" aria-label={t('results.aria')}>
            {visible.slice(0, 8).map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => showBook(b.id)}>
                  <span className="r-title">{b.title}</span>
                  <span className="r-author">{b.author}</span>
                  {(hitsById[b.id] || []).filter((h) => h.field !== 'titulo' && h.field !== 'autor').slice(0, 2).map((h, i) => (
                    <span key={i} className="r-hit"><b>{t(`hit.${h.label}`)}{h.page ? ` p. ${h.page}` : ''}:</b> {h.field === 'categoria' ? cat(h.raw) : h.text}</span>
                  ))}
                </button>
              </li>
            ))}
            {visible.length > 8 ? <li className="r-more">{t('results.more', { n: visible.length - 8 })}</li> : null}
          </ul>
        ) : null}
      </nav> : null}

      <section className="shelf-wrap" aria-label={t('shelf.aria')}>
        {!books ? <div className="loading">{t(mode === 'connecting' ? 'shelf.connecting' : 'shelf.loading')}</div>
          : !books.length ? <EmptyShelf canEdit={canEdit} isCloud={isCloud} cloud={cloudRef} onAdd={() => setSheetOpen(true)} />
          : visible.length ? <Bookshelf books={visible} onSelectionChange={setSelection} reveal={reveal} goto={goto} />
          : (
            <div className="empty">
              <p>{query.trim() ? t('shelf.noMatch', { q: query.trim() }) : t('shelf.noFilter')}</p>
              <button type="button" className="btn btn-ghost" onClick={clearFilters}>{t('shelf.clearAll')}</button>
            </div>
          )}
      </section>

      {books?.length ? <Legend /> : null}

      <section className="caption" aria-live="polite">
        <div className="steps" role="group" aria-label={t('steps.label')}>
          {STEPS.map((st) => (
            <button
              key={st.label} type="button"
              className={st.key === face ? 'on' : ''}
              aria-pressed={st.key === face}
              disabled={!book}
              onClick={() => setGoto({ face: st.key, n: Date.now() })}
            >{t(st.label)}</button>
          ))}
        </div>
        {book ? (
          <>
            <h2>{book.title}</h2>
            <p className="by">{book.author}{book.pages ? ` · ${t('panel.pages', { n: book.pages })}` : ''}</p>
            {book.categories?.length ? (
              <p className="book-cats">
                {book.categories.map((c) => (
                  <button key={c} type="button" className="cat-tag" style={{ '--h': categoryHue(c) }}
                    onClick={() => { setCats([c]); }} title={t('panel.seeCategory', { c: cat(c) })}>{cat(c)}</button>
                ))}
              </p>
            ) : null}
            <p className="hint">{hint}</p>
            {canEdit ? (
              <BookEditor book={book} onChange={update} save={save} usingApi={usingApi} isCloud={isCloud} categories={categories}
                onDelete={isCloud || usingApi || book.own ? () => removeBook(book) : null} />
            ) : <BookReadOnly book={book} />}
          </>
        ) : (
          <>
            <h2 className="muted">{t('panel.none')}</h2>
            <p className="hint">{hint}</p>
          </>
        )}
        {error ? <p className="err">{t('panel.apiError', { e: error })}</p> : null}
      </section>

      <AddBookSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={addBook}
        source={usingApi ? 'api' : 'demo'}
        canUpload={!isCloud || cloudInfo.canUpload}
        token={usingApi ? getToken() : ''}
        categories={categories}
      />

      {mode !== 'connecting' ? (
        <FloatControls
          hasBooks={!!books?.length} canEdit={canEdit} onAdd={() => setSheetOpen(true)} onSearch={focusSearch}
          scope={scope} setScope={setScope} fFormat={fFormat} setFFormat={setFFormat} fStatus={fStatus} setFStatus={setFStatus}
          cats={cats} setCats={setCats} toggleCat={toggleCat} sort={sort} setSort={setSort}
          shownCats={shownCats} catCounts={catCounts} counts={counts} visibleCount={visible.length} anyActive={anyActive}
        />
      ) : null}
    </main>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([k, text, color]) => (
          <button
            key={k} type="button" role="radio" aria-checked={value === k}
            className={value === k ? 'on' : ''}
            style={value === k && color ? { background: color, color: '#1a140d' } : undefined}
            onClick={() => onChange(k)}
          >{text}</button>
        ))}
      </div>
    </div>
  );
}

function BookEditor({ book, onChange, save, usingApi, isCloud, onDelete, categories }) {
  const { t } = useI18n();
  const format = normFormat(book.format);
  const status = normStatus(book.readStatus);
  const [confirm, setConfirm] = useState(false);
  const [delErr, setDelErr] = useState('');
  useEffect(() => { setConfirm(false); setDelErr(''); }, [book.id]);
  return (
    <div className="editor">
      <Segmented
        label={t('editor.format')} value={format}
        options={Object.keys(FORMATS).map((k) => [k, t(`format.${k}`)])}
        onChange={(v) => onChange(book.id, { format: v })}
      />
      <Segmented
        label={t('editor.reading')} value={status}
        options={Object.entries(READ_STATUS).map(([k, s]) => [k, t(`status.${k}`), s.color])}
        onChange={(v) => onChange(book.id, { readStatus: v })}
      />
      <CategoryPicker
        value={book.categories || []}
        all={categories}
        onChange={(v) => onChange(book.id, { categories: v })}
      />
      <label className="field">
        <span className="field-label">{t('editor.summary')}</span>
        <textarea
          rows={4}
          maxLength={1500}
          placeholder={t('editor.summaryPh')}
          value={book.note || ''}
          onChange={(e) => onChange(book.id, { note: e.target.value }, { debounce: true })}
        />
      </label>
      <NotesEditor
        notes={Array.isArray(book.notes) ? book.notes : []}
        onChange={(notes) => onChange(book.id, { notes })}
      />
      <p className={`save save-${save || 'idle'}`}>
        {save === 'guardando' ? t('save.saving')
          : save === 'guardado' ? t(isCloud ? 'save.cloud' : usingApi ? 'save.api' : 'save.local')
          : save === 'error' ? t('save.error') : ' '}
      </p>
      {(book.isbn || book.publisher) ? (
        <p className="meta-line">{[book.publisher, book.isbn && `ISBN ${book.isbn}`].filter(Boolean).join(' · ')}</p>
      ) : null}
      {onDelete ? (
        <div className="danger">
          {confirm ? (
            <>
              <span>{t('delete.ask', { title: book.title })}</span>
              <button type="button" className="btn btn-danger" onClick={() => onDelete().catch((e) => setDelErr(e.message))}>{t('delete.yes')}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>{t('delete.no')}</button>
            </>
          ) : (
            <button type="button" className="link danger-link" onClick={() => setConfirm(true)}>{t('delete.link')}</button>
          )}
          {delErr ? <p className="err">{delErr}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  return (
    <ul className="legend" aria-label={t('legend.aria')}>
      <li><svg width="13" height="13" viewBox="0 0 10 10"><path d="M1.2 2.2 Q3.2 1.2 5 2.4 Q6.8 1.2 8.8 2.2 V8.4 Q6.8 7.4 5 8.6 Q3.2 7.4 1.2 8.4 Z M5 2.4 V8.6" fill="none" stroke="currentColor" strokeWidth="1" /></svg>{t('legend.fisico')}</li>
      <li><svg width="13" height="13" viewBox="0 0 10 10"><rect x="2" y="0.8" width="6" height="8.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" /><circle cx="5" cy="7.6" r="0.6" fill="currentColor" /></svg>{t('legend.virtual')}</li>
      <li><span className="lg-dot" style={{ background: READ_STATUS.leido.color }} />{t('status.leido')}</li>
      <li><span className="lg-dot half" style={{ '--c': READ_STATUS.leyendo.color }} />{t('status.leyendo')}</li>
      <li><span className="lg-dot ring" />{t('status.pendiente')}</li>
    </ul>
  );
}

function NotesEditor({ notes, onChange }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const add = (e) => {
    e?.preventDefault?.();
    const txt = text.trim();
    if (!txt) return;
    const p = page.trim().replace(/^(p|pg|pág|pag)\.?\s*/i, '');
    onChange([...notes, { id: `n${Date.now().toString(36)}`, text: txt, page: p || null, date: new Date().toISOString().slice(0, 10) }]);
    setText(''); setPage('');
  };
  return (
    <div className="field">
      <span className="field-label">{t('editor.notes')}{notes.length ? ` · ${notes.length}` : ''}</span>
      {notes.length ? (
        <ul className="notes-list">
          {notes.map((n) => (
            <li key={n.id}>
              <div>
                {n.page ? <b>p. {n.page}</b> : null}
                <span>{n.text}</span>
              </div>
              <button type="button" className="icon-btn sm" aria-label={t('editor.deleteNote', { page: n.page })}
                onClick={() => onChange(notes.filter((x) => x.id !== n.id))}>
                <svg width="12" height="12" viewBox="0 0 18 18"><path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="note-add">
        <input className="note-page" value={page} onChange={(e) => setPage(e.target.value)} placeholder={t('editor.pagePh')} inputMode="numeric" aria-label={t('editor.page')} />
        <input className="note-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('editor.notePh')}
          aria-label={t('editor.noteText')} onKeyDown={(e) => { if (e.key === 'Enter') add(e); }} />
        <button type="button" className="btn btn-primary sm" onClick={add} disabled={!text.trim()}>{t('editor.addNote')}</button>
      </div>
    </div>
  );
}

// ── Estado de sincronización, ejemplos e importación ─────────────────────
function SyncBar({ mode, cloudState, canEdit, books, cloud }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState('');
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [msg, setMsg] = useState('');
  const local = useMemo(() => (mode === 'cloud' && canEdit ? loadOwnBooks() : []), [mode, canEdit]);
  const [imported, setImported] = useState(false);
  const demoCount = (books || []).filter((b) => b.demo).length;

  if (mode === 'connecting' || mode === 'api') return null;
  if (mode === 'local') {
    return <p className="sync sync-local">{t('sync.local')}</p>;
  }

  const runImport = async () => {
    setBusy('import'); setMsg('');
    try {
      const n = await importLocal(cloud.current, local, (k) => setMsg(t('sync.uploadProgress', { k, n: local.length })));
      saveOwnBooks([]);
      setImported(true);
      setMsg(t('sync.uploaded', { n }));
    } catch (e) {
      setMsg(t(e?.code === 'quota_exceeded' ? 'sync.full' : 'sync.uploadFail'));
    }
    setBusy('');
  };

  const runRemoveDemo = async () => {
    setBusy('demo'); setMsg('');
    try { await removeDemo(cloud.current, books); setMsg(t('sync.demoRemoved')); } catch { setMsg(t('sync.demoFail')); }
    setBusy(''); setConfirmDemo(false);
  };

  return (
    <div className="sync">
      <p className={`sync-line ${cloudState.error ? 'is-err' : cloudState.stale ? 'is-warn' : ''}`}>
        <span className="sync-dot" aria-hidden="true" />
        {cloudState.error
          ? t(cloudState.error === 'revoked' ? 'sync.revoked' : 'sync.lost')
          : t(cloudState.stale ? 'sync.stale' : canEdit ? 'sync.ok' : 'sync.readonly')}
      </p>
      {canEdit && local.length && !imported ? (
        <div className="sync-card">
          <span>{t('sync.localBooks', { n: local.length })}</span>
          <button type="button" className="btn btn-primary sm" disabled={!!busy} onClick={runImport}>
            {t(busy === 'import' ? 'sync.uploading' : 'sync.upload')}
          </button>
        </div>
      ) : null}
      {canEdit && demoCount ? (
        <div className="sync-row">
          {confirmDemo ? (
            <>
              <span>{t('sync.demoAsk', { n: demoCount })}</span>
              <button type="button" className="btn btn-danger" disabled={!!busy} onClick={runRemoveDemo}>{t(busy === 'demo' ? 'sync.demoRemoving' : 'sync.demoYes')}</button>
              <button type="button" className="btn btn-ghost sm" onClick={() => setConfirmDemo(false)}>{t('delete.no')}</button>
            </>
          ) : (
            <>
              <span>{t('sync.demoCount', { n: demoCount })}</span>
              <button type="button" className="link" onClick={() => setConfirmDemo(true)}>{t('sync.demoRemove')}</button>
            </>
          )}
        </div>
      ) : null}
      {msg ? <p className="sync-msg" aria-live="polite">{msg}</p> : null}
    </div>
  );
}

function EmptyShelf({ canEdit, isCloud, cloud, onAdd }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="empty empty-shelf">
      <svg width="64" height="48" viewBox="0 0 64 48" aria-hidden="true"><rect x="6" y="8" width="7" height="32" rx="1" fill="currentColor" opacity=".35" /><rect x="15" y="4" width="9" height="36" rx="1" fill="currentColor" opacity=".55" /><rect x="26" y="12" width="6" height="28" rx="1" fill="currentColor" opacity=".3" /><path d="M2 42h60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".6" /></svg>
      <h2>{t('empty.title')}</h2>
      {canEdit ? (
        <>
          <p>{t('empty.text')}</p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={onAdd}>{t('empty.add')}</button>
            {isCloud ? (
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={async () => {
                setBusy(true); setErr('');
                try { await seedDemo(cloud.current); } catch { setErr(t('empty.seedFail')); }
                setBusy(false);
              }}>{t(busy ? 'empty.seeding' : 'empty.seed')}</button>
            ) : null}
          </div>
          {err ? <p className="err">{err}</p> : null}
        </>
      ) : <p>{t('empty.readonly')}</p>}
    </div>
  );
}

function BookReadOnly({ book }) {
  const { t } = useI18n();
  const notes = Array.isArray(book.notes) ? book.notes : [];
  return (
    <div className="editor ro">
      <p className="ro-tags">
        <span>{t(`format.${normFormat(book.format)}`)}</span>
        <span style={{ background: READ_STATUS[normStatus(book.readStatus)].color, color: '#1a140d' }}>{t(`status.${normStatus(book.readStatus)}`)}</span>
      </p>
      {book.note ? (
        <div className="field"><span className="field-label">{t('ro.summary')}</span><p className="ro-text">{book.note}</p></div>
      ) : null}
      {notes.length ? (
        <div className="field">
          <span className="field-label">{t('ro.notes')} · {notes.length}</span>
          <ul className="notes-list">
            {notes.map((n) => <li key={n.id}><div>{n.page ? <b>p. {n.page}</b> : null}<span>{n.text}</span></div></li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
