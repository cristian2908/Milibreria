import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Book3D from './Book3D.jsx';
import { useCoverInfos } from './useCoverInfo.js';
import { layoutShelf, clamp } from './geometry.js';
import './bookshelf.css';

const PERSPECTIVE = 1100;

function useReducedMotion() {
  const [r, setR] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return r;
}

/**
 * Estantería 3D interactiva.
 *
 * props:
 *  - books: [{ id, title, author, cover, pages, description, spineColor?, aspect?,
 *             format?: 'fisico'|'virtual', readStatus?: 'pendiente'|'leyendo'|'leido', note? }]
 *  - onSelectionChange?: ({ id, face }) => void   face: 'front' | 'inside' | 'back' | null
 *  - coverWidth?: ancho de portada fijo; si se omite se adapta al contenedor
 *  - reveal?: { id, n } — lleva el estante hasta ese libro y lo saca (p. ej. al agregarlo)
 *  - goto?: { face, n } — cambia la vista del libro abierto: 'front' | 'inside' | 'back' | null
 */
export default function Bookshelf({ books, onSelectionChange, coverWidth: fixedWidth, reveal, goto }) {
  const scrollerRef = useRef(null);
  const stageRef = useRef(null);
  const [autoWidth, setAutoWidth] = useState(150);
  const [sel, setSel] = useState(null); // { id, face, dx }
  const reducedMotion = useReducedMotion();
  const infos = useCoverInfos(books);

  const coverWidth = fixedWidth || autoWidth;

  // Ancho de portada según el tamaño del contenedor (móvil ↔ escritorio)
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || fixedWidth) return;
    const ro = new ResizeObserver(([e]) => setAutoWidth(Math.round(clamp(e.contentRect.width * 0.36, 118, 180))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedWidth]);

  const withAspect = useMemo(
    () => books.map((b) => ({ ...b, aspect: infos[b.id]?.aspect || b.aspect })),
    [books, infos]
  );
  const { slots, totalWidth, maxHeight } = useMemo(
    () => layoutShelf(withAspect, coverWidth),
    [withAspect, coverWidth]
  );
  const slotById = useMemo(() => Object.fromEntries(slots.map((s) => [s.id, s])), [slots]);

  const padX = Math.round(coverWidth * 0.9);
  const padTop = Math.round(maxHeight * 0.62);
  const plank = 16;
  const padBottom = 34;
  const depth = coverWidth + 22;
  const stageW = Math.max(totalWidth + padX * 2, 0);
  const stageH = padTop + maxHeight + plank + padBottom;

  const pullZ = Math.round(coverWidth * 0.72);
  const frontZ = Math.round(coverWidth * 1.25);
  const lift = Math.round(maxHeight * 0.2);
  // Abierto ocupa dos anchos: acercarlo solo hasta que la doble página quepa en pantalla
  const [viewW, setViewW] = useState(390);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setViewW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const maxScale = (viewW * 0.94) / (coverWidth * 2);
  const openZ = Math.round(clamp(PERSPECTIVE * (1 - 1 / Math.max(maxScale, 0.5)), -coverWidth, frontZ * 1.15));

  // Mantiene el punto de fuga en el centro de lo visible mientras se hace scroll
  const syncOrigin = useCallback(() => {
    const sc = scrollerRef.current, st = stageRef.current;
    if (!sc || !st) return;
    st.style.perspectiveOrigin = `${sc.scrollLeft + sc.clientWidth / 2}px ${padTop + maxHeight * 0.45}px`;
  }, [padTop, maxHeight]);
  useLayoutEffect(syncOrigin, [syncOrigin, stageW]);

  // Centra horizontalmente el estante al cargar si cabe completo
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (sc && sc.scrollWidth > sc.clientWidth && sc.scrollLeft === 0) {
      sc.scrollLeft = Math.max(0, padX - 16);
      syncOrigin();
    }
  }, [padX, syncOrigin]);

  const dxFor = useCallback((id) => {
    const sc = scrollerRef.current, s = slotById[id];
    if (!sc || !s) return 0;
    const visibleCenter = sc.scrollLeft + sc.clientWidth / 2;
    return Math.round(visibleCenter - (padX + s.x + s.width / 2));
  }, [slotById, padX]);

  const activate = useCallback((id) => {
    setSel((cur) => {
      if (!cur || cur.id !== id) return { id, face: 'front', dx: dxFor(id) };
      if (cur.face === 'front') return { ...cur, face: 'inside' };
      if (cur.face === 'inside') return { ...cur, face: 'back' };
      return null;
    });
  }, [dxFor]);

  const close = useCallback(() => setSel(null), []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Mostrar un libro desde fuera (recién agregado): centrarlo con scroll y sacarlo
  const revealed = useRef(0);
  const revealReady = !!(reveal?.id && slotById[reveal.id]);
  useEffect(() => {
    if (!revealReady || revealed.current === reveal.n) return;
    const sc = scrollerRef.current, s = slotById[reveal.id];
    if (!sc) return;
    revealed.current = reveal.n;
    setSel(null);
    const target = Math.max(0, padX + s.x + s.width / 2 - sc.clientWidth / 2);
    sc.scrollTo({ left: target, behavior: reducedMotion ? 'auto' : 'smooth' });
    const t = setTimeout(() => {
      syncOrigin();
      setSel({ id: reveal.id, face: 'front', dx: dxFor(reveal.id) });
    }, reducedMotion ? 0 : 650);
    return () => clearTimeout(t);
  }, [reveal?.n, revealReady]);

  // Cambiar de vista desde fuera (botones del panel)
  useEffect(() => {
    if (!goto?.n) return;
    setSel((cur) => (!cur ? cur : goto.face ? { ...cur, face: goto.face } : null));
  }, [goto?.n]);

  // Si un filtro saca del estante el libro abierto, se cierra la selección
  useEffect(() => {
    if (sel && !books.some((b) => b.id === sel.id)) setSel(null);
  }, [books, sel]);

  useEffect(() => {
    onSelectionChange?.({ id: sel?.id || null, face: sel?.face || null });
  }, [sel?.id, sel?.face]);

  return (
    <div
      className={`bs-scroller ${sel ? 'has-open' : ''}`}
      ref={scrollerRef}
      onScroll={syncOrigin}
      onClick={close}
      style={{ height: stageH }}
    >
      <div
        className="bs-stage"
        ref={stageRef}
        style={{ width: stageW, height: stageH, perspective: `${PERSPECTIVE}px` }}
      >
        <div
          className="bs-shelf"
          style={{ left: padX - 24, top: padTop, width: totalWidth + 48, height: maxHeight }}
        >
          <div className="bs-wall" style={{ transform: `translateZ(${-depth / 2}px)` }} />
          <div
            className="bs-plank-top"
            style={{ height: depth, top: maxHeight, transform: `translateZ(${-depth / 2}px) rotateX(90deg)` }}
          />
          <div className="bs-plank-front" style={{ top: maxHeight, height: plank, transform: `translateZ(${depth / 2}px)` }} />

          <div className="bs-row" style={{ left: 24, width: totalWidth, height: maxHeight }}>
            {withAspect.map((book) => {
              const slot = slotById[book.id];
              const target = sel?.id === book.id ? sel.face : 'shelf';
              return (
                <Book3D
                  key={book.id}
                  book={book}
                  info={infos[book.id]}
                  slot={{ ...slot, x: slot.x, height: slot.height }}
                  coverWidth={coverWidth}
                  target={target}
                  dx={sel?.id === book.id ? sel.dx : 0}
                  lift={lift}
                  pullZ={pullZ}
                  frontZ={frontZ}
                  openZ={openZ}
                  onActivate={activate}
                  reducedMotion={reducedMotion}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
