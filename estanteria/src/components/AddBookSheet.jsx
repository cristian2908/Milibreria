import { useEffect, useRef, useState } from 'react';
import { FORMATS, READ_STATUS } from '../bookshelf/status.js';
import { fileToImage, renderImage, normalizeBox, imageDataOf } from '../scan/image.js';
import { loadOpenCVFrom, detectBook } from '../scan/cvcrop.js';
import { leerLocal } from '../scan/local.js';
import { analyzeCovers, scanInfo } from '../scan/analyze.js';
import CategoryPicker from './CategoryPicker.jsx';
import { cleanCategory } from '../search.js';
import { PUBLIC_URL, IN_CLAUDE, OPENCV_URLS } from '../config.js';
import { useI18n } from '../i18n.jsx';

const EMPTY = {
  title: '', author: '', pages: '', format: 'fisico', readStatus: 'pendiente',
  description: '', note: '', isbn: '', publisher: '', categories: [],
};

/**
 * Hoja para agregar libros.
 *  - Manual: formulario (+ portada/contraportada opcionales desde la galería)
 *  - Con fotos: foto de portada y contraportada → lectura con IA → revisar → guardar
 */
export default function AddBookSheet({ open, onClose, onSave, source, token, categories = [], canUpload = true }) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState('fotos');
  const [form, setForm] = useState(EMPTY);
  const [front, setFront] = useState(null); // { img, box, quad, crop: 'buscando'|'listo'|'nada'|'sin-opencv' }
  const [back, setBack] = useState(null);
  const [useCrop, setUseCrop] = useState(true);
  const [preview, setPreview] = useState({ front: null, back: null }); // render final
  const [scan, setScan] = useState({ state: 'idle', msg: '' });
  const [canScan, setCanScan] = useState(null);
  const [provider, setProvider] = useState(null);
  const [readText, setReadText] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggested, setSuggested] = useState([]);
  const [err, setErr] = useState('');
  const abortRef = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => { scanInfo(source, token).then((i) => { setCanScan(i.available); setProvider(i.provider); }); }, [source, token]);

  // OpenCV pesa ~4 MB comprimido: se empieza a bajar al abrir la hoja en modo fotos
  useEffect(() => { if (open && mode === 'fotos') loadOpenCVFrom(OPENCV_URLS).catch(() => {}); }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey, true); };
  }, [open, onClose]);

  // Vista final (recortada y reducida) de cada foto
  useEffect(() => {
    let alive = true;
    (async () => {
      const f = front ? await renderImage(front.img, cropOf(front, useCrop, { maxSide: 640, quality: 0.8 })) : null;
      const b = back ? await renderImage(back.img, cropOf(back, useCrop, { maxSide: 640, quality: 0.78 })) : null;
      if (alive) setPreview({ front: f, back: b });
    })();
    return () => { alive = false; };
  }, [front, back, useCrop]);

  const reset = () => {
    abortRef.current?.abort();
    setForm(EMPTY); setFront(null); setBack(null); setUseCrop(true);
    setScan({ state: 'idle', msg: '' }); setErr(''); setSaving(false); setSuggested([]); setReadText('');
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));

  const [photoErr, setPhotoErr] = useState('');

  const loadFile = async (which, file) => {
    if (!file) return;
    setPhotoErr('');
    const name = (file.name || '').toLowerCase();
    if (/hei[cf]$/.test(name) || /hei[cf]/.test(file.type)) {
      setPhotoErr('sheet.heic');
      return;
    }
    if (file.type && !file.type.startsWith('image/')) { setPhotoErr('sheet.notImage'); return; }
    try {
      const img = await fileToImage(file);
      const setter = which === 'front' ? setFront : setBack;
      setter({ img, box: null, quad: null, crop: 'buscando' });
      if (scan.state === 'done') setScan({ state: 'idle', msg: '' });
      autoCrop(img).then((r) => setter((p) => (p && p.img === img ? { ...p, quad: r.quad, crop: r.crop } : p)));
    } catch {
      setPhotoErr('sheet.cantOpen');
    }
  };

  // Busca el libro en la foto con OpenCV (no bloquea: si falla, se usa la foto completa)
  const autoCrop = async (img) => {
    let cv;
    try { cv = await loadOpenCVFrom(OPENCV_URLS); } catch { return { quad: null, crop: 'sin-opencv' }; }
    try {
      const r = await detectBook(cv, imageDataOf(img, 1200));
      return r.confident ? { quad: r.quad, crop: 'listo' } : { quad: null, crop: 'nada' };
    } catch { return { quad: null, crop: 'nada' }; }
  };

  const pick = (which) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    loadFile(which, file);
  };

  // Pegar una imagen (Ctrl+V / mantener pulsado → Pegar): va a la portada, o a la contraportada si ya hay portada
  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      loadFile(front ? 'back' : 'front', item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, front]);

  const runScan = async () => {
    if (!front) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setScan({ state: 'reading', msg: back ? 'sheet.readingBoth' : 'sheet.readingFront' });
    setErr('');
    try {
      const opts = { maxSide: 1400, quality: 0.82 };
      const fFull = await renderImage(front.img, useCrop && front.quad ? { ...opts, quad: front.quad } : opts);
      const bFull = back ? await renderImage(back.img, useCrop && back.quad ? { ...opts, quad: back.quad } : opts) : null;
      const r = await analyzeCovers({ front: fFull, back: bFull }, { source, token, signal: ctrl.signal, categories, lang });
      aplicar(r, false);
    } catch (ex) {
      if (ex.name === 'AbortError') return;
      const msg = ex.code === 'not_granted' ? 'sheet.readNotGranted'
        : ex.code === 'rate_limited' ? 'sheet.readRate'
        : ex.code === 'unavailable' ? 'sheet.readUnavailable'
        : 'sheet.readFail';
      setScan({ state: 'error', msg });
    }
  };

  // Lectura en el dispositivo con Tesseract (sin internet, sin cupos)
  const runLocal = async () => {
    if (!front) return;
    abortRef.current?.abort();
    setErr('');
    const etapa = (e, p) => setScan({ state: 'reading', msg: `sheet.local.${e}`, pct: Math.round((p || 0) * 100) });
    etapa('cargando', 0);
    try {
      const opts = { maxSide: 1600, quality: 0.9 };
      const fImg = await renderImage(front.img, useCrop && front.quad ? { ...opts, quad: front.quad } : opts);
      const bImg = back ? await renderImage(back.img, useCrop && back.quad ? { ...opts, quad: back.quad } : opts) : null;
      const r = await leerLocal({ front: fImg.blob, back: bImg?.blob, categories, onEtapa: etapa });
      aplicar(r, true);
    } catch (ex) {
      console.error('lectura local:', ex);
      setScan({ state: 'error', msg: 'sheet.localFail' });
    }
  };

  const aplicar = (r, local) => {
    {
      const sugg = (Array.isArray(r.categorias) ? r.categorias : []).map(cleanCategory).filter(Boolean).slice(0, 3);
      setSuggested(sugg);
      setReadText(r.texto_visible || '');
      // la caja de la IA solo se usa si OpenCV no encontró el libro
      setFront((p) => p && (p.quad ? p : { ...p, box: normalizeBox(r.recorte_portada) }));
      setBack((p) => p && (p.quad ? p : { ...p, box: normalizeBox(r.recorte_contraportada) }));
      setForm((f) => ({
        ...f,
        title: r.titulo || f.title,
        author: r.autor || f.author,
        pages: r.paginas ? String(r.paginas) : f.pages,
        description: r.descripcion || f.description,
        isbn: r.isbn || f.isbn,
        publisher: r.editorial || f.publisher,
        categories: f.categories.length ? f.categories : sugg,
      }));
      const low = r.confianza === 'baja';
      const msg = r._descripcion_descartada ? 'sheet.descDiscarded'
        : local ? (low ? 'sheet.localLow' : 'sheet.localDone') : low ? 'sheet.readLow' : 'sheet.readDone';
      setScan({ state: 'done', via: local ? 'local' : 'ia', msg });
      setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 50);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr(t('sheet.titleRequired')); titleRef.current?.focus(); return; }
    setSaving(true); setErr('');
    const pages = parseInt(form.pages, 10);
    const book = {
      id: `local-${Date.now().toString(36)}`,
      title: form.title.trim(),
      author: form.author.trim(),
      pages: Number.isFinite(pages) && pages > 0 ? pages : null,
      format: form.format,
      readStatus: form.readStatus,
      description: form.description.trim(),
      note: form.note.trim(),
      isbn: form.isbn.trim(),
      publisher: form.publisher.trim(),
      categories: form.categories,
      cover: preview.front?.dataUrl || '',
      backCover: preview.back?.dataUrl || '',
      aspect: preview.front?.aspect || null,
      viaFoto: mode === 'fotos',
    };
    try {
      await onSave(book);
      reset();
      onClose();
    } catch (ex) {
      setErr(ex.message || t('sheet.saveFail'));
      setSaving(false);
    }
  };

  if (!open) return null;

  const photoMode = mode === 'fotos';
  const hasQuads = !!(front?.quad || back?.quad);
  const hasBoxes = hasQuads || !!(front?.box || back?.box);
  const finding = front?.crop === 'buscando' || back?.crop === 'buscando';
  const notFound = [front, back].filter((p) => p?.crop === 'nada').length;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="sheet-head">
          <h2 id="sheet-title">{t('sheet.title')}</h2>
          <button type="button" className="icon-btn" aria-label={t('sheet.close')} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div className="sheet-body">
          <div className="seg tabs" role="tablist">
            <button type="button" role="tab" aria-selected={photoMode} className={photoMode ? 'on' : ''} onClick={() => setMode('fotos')}>{t('sheet.tabPhotos')}</button>
            <button type="button" role="tab" aria-selected={!photoMode} className={!photoMode ? 'on' : ''} onClick={() => setMode('manual')}>{t('sheet.tabManual')}</button>
          </div>

          <p className="sheet-intro">
            {t(photoMode ? 'sheet.introPhotos' : 'sheet.introManual')}
          </p>

          <div className="shots">
            <PhotoTile label={t('sheet.front')} required={photoMode} preview={preview.front} onPick={pick('front')} onDropFile={(f) => loadFile('front', f)} onClear={() => setFront(null)} />
            <PhotoTile label={t('sheet.back')} preview={preview.back} onPick={pick('back')} onDropFile={(f) => loadFile('back', f)} onClear={() => setBack(null)} />
          </div>
          {photoErr ? <p className="err" role="alert">{t(photoErr)}</p> : null}
          <p className="photo-help">
            {t('sheet.photoHelp')}
            {IN_CLAUDE ? (
              <>{t('sheet.photoHelpApp1')}<a href={PUBLIC_URL} target="_blank" rel="noopener noreferrer">{t('sheet.photoHelpLink')}</a>{t('sheet.photoHelpApp2')}</>
            ) : null}
          </p>

          {hasBoxes ? (
            <label className="toggle">
              <input type="checkbox" checked={useCrop} onChange={(e) => setUseCrop(e.target.checked)} />
              <span>{t(hasQuads ? 'sheet.cropAuto' : 'sheet.crop')}</span>
            </label>
          ) : null}
          {photoMode && (finding || notFound) ? (
            <p className="crop-msg" aria-live="polite">
              {finding ? <span className="spinner" aria-hidden="true" /> : null}
              {t(finding ? 'sheet.cropFinding' : 'sheet.cropNone')}
            </p>
          ) : null}

          {photoMode ? (
            <div className="scan">
              <button
                type="button" className="btn btn-scan"
                disabled={!front || scan.state === 'reading' || canScan === false}
                onClick={runScan}
              >
                {scan.state === 'reading' ? <span className="spinner" aria-hidden="true" /> : (
                  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13M6 10h8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                )}
                {t(scan.state === 'reading' ? 'sheet.reading' : scan.state === 'done' && scan.via === 'ia' ? 'sheet.readAgain' : 'sheet.read')}
              </button>
              <button
                type="button" className="btn btn-ghost btn-local"
                disabled={!front || scan.state === 'reading'}
                onClick={runLocal}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="2.5" width="10" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 6h4M8 9h4M8 12h2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                {t('sheet.local.btn')}
              </button>
              <p className={`scan-msg is-${scan.state}`} aria-live="polite">
                {scan.msg ? t(scan.msg) + (scan.state === 'reading' && scan.pct ? ` ${scan.pct} %` : '')
                  : t(canScan === false ? 'sheet.local.only' : !front ? 'sheet.readFirst' : provider === 'openrouter' ? 'sheet.readUsesOpenRouter' : 'sheet.readUsesClaude')}
              </p>
              {readText ? (
                <details className="read-text">
                  <summary>{t('sheet.readText')}</summary>
                  <p>{readText}</p>
                </details>
              ) : null}
            </div>
          ) : null}

          <fieldset className="form" disabled={scan.state === 'reading'}>
            <label className="field">
              <span className="field-label">{t('sheet.fTitle')}</span>
              <input ref={titleRef} value={form.title} onChange={set('title')} required autoComplete="off" />
            </label>
            <label className="field">
              <span className="field-label">{t('sheet.fAuthor')}</span>
              <input value={form.author} onChange={set('author')} autoComplete="off" />
            </label>
            <div className="row2">
              <label className="field">
                <span className="field-label">{t('sheet.fPages')}</span>
                <input value={form.pages} onChange={set('pages')} inputMode="numeric" pattern="[0-9]*" placeholder={t('sheet.fPagesPh')} />
              </label>
              <label className="field">
                <span className="field-label">{t('sheet.fIsbn')}</span>
                <input value={form.isbn} onChange={set('isbn')} inputMode="numeric" autoComplete="off" />
              </label>
            </div>

            <CategoryPicker
              value={form.categories}
              all={[...categories, ...suggested.filter((c) => !categories.some((a) => a.toLowerCase() === c.toLowerCase()))]}
              suggested={suggested}
              onChange={(v) => setForm((f) => ({ ...f, categories: v }))}
              label={t(suggested.length ? 'cats.suggested' : 'cats.label')}
            />
            <Seg label={t('editor.format')} value={form.format} onChange={set('format')}
              options={Object.keys(FORMATS).map((k) => [k, t(`format.${k}`)])} />
            <Seg label={t('editor.reading')} value={form.readStatus} onChange={set('readStatus')}
              options={Object.entries(READ_STATUS).map(([k, st]) => [k, t(`status.${k}`), st.color])} />

            <label className="field">
              <span className="field-label">{t('sheet.fDesc')}</span>
              <textarea rows={3} value={form.description} onChange={set('description')} maxLength={2000} />
            </label>
            <label className="field">
              <span className="field-label">{t('sheet.fNote')}</span>
              <textarea rows={3} value={form.note} onChange={set('note')} maxLength={1500}
                placeholder={t('sheet.fNotePh')} />
            </label>
          </fieldset>
          {err ? <p className="err" role="alert">{err}</p> : null}
        </div>

        <footer className="sheet-foot">
          <button type="button" className="btn btn-ghost" onClick={() => { reset(); onClose(); }}>{t('sheet.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving || scan.state === 'reading'}>
            {t(saving ? 'sheet.saving' : 'sheet.save')}
          </button>
        </footer>
      </form>
    </div>
  );
}

function PhotoTile({ label, required, preview, onPick, onDropFile, onClear }) {
  const { t } = useI18n();
  const [over, setOver] = useState(false);
  return (
    <div className={`shot ${preview ? 'has' : ''} ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDropFile(e.dataTransfer.files?.[0]); }}
    >
      {/* Sin `capture`: el sistema ofrece Cámara y Galería. Con `capture` la app de Claude bloquea la cámara sin avisar. */}
      <label className="shot-pick">
        <input type="file" accept="image/*" onChange={onPick} aria-label={t('sheet.pickAria', { label })} />
        {preview ? (
          <img src={preview.dataUrl} alt={t('sheet.selected', { label })} />
        ) : (
          <span className="shot-empty">
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12.5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            <span>{label}{required ? '' : t('sheet.optional')}</span>
            <span className="shot-sub">{t('sheet.cameraOrGallery')}</span>
          </span>
        )}
      </label>
      <span className="shot-cap">
        {label}
        {preview ? <button type="button" className="link" onClick={onClear}>{t('sheet.remove')}</button> : (
          <label className="link shot-cam">
            <input type="file" accept="image/*" capture="environment" onChange={onPick} />
            {t('sheet.directCamera')}
          </label>
        )}
      </span>
    </div>
  );
}

function Seg({ label, value, options, onChange }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([k, text, color]) => (
          <button key={k} type="button" role="radio" aria-checked={value === k}
            className={value === k ? 'on' : ''}
            style={value === k && color ? { background: color, color: '#1a140d' } : undefined}
            onClick={() => onChange(k)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

/** Opciones de recorte para renderImage: primero el cuadrilátero de OpenCV, si no la caja de la IA. */
function cropOf(photo, useCrop, base) {
  if (!useCrop) return base;
  if (photo.quad) return { ...base, quad: photo.quad };
  return { ...base, box: photo.box };
}
