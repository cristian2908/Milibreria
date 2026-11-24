import { memo, useEffect, useRef, useState } from 'react';
import { css, shade } from './color.js';
import { READ_STATUS, normFormat, normStatus } from './status.js';
import { useI18n } from '../i18n.jsx';

function SpineBadges({ format, status, size, ink }) {
  const c = READ_STATUS[status].color;
  return (
    <span className="bs-badges" style={{ color: ink }} aria-hidden="true">
      {format === 'virtual' ? (
        <svg width={size} height={size} viewBox="0 0 10 10"><rect x="2" y="0.8" width="6" height="8.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" /><circle cx="5" cy="7.6" r="0.6" fill="currentColor" /></svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 10 10"><path d="M1.2 2.2 Q3.2 1.2 5 2.4 Q6.8 1.2 8.8 2.2 V8.4 Q6.8 7.4 5 8.6 Q3.2 7.4 1.2 8.4 Z M5 2.4 V8.6" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" /></svg>
      )}
      <svg width={size} height={size} viewBox="0 0 10 10">
        {status === 'leido' && <><circle cx="5" cy="5" r="4.2" fill={c} /><path d="M3 5.2 4.4 6.5 7 3.8" fill="none" stroke="#14301c" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></>}
        {status === 'leyendo' && <><circle cx="5" cy="5" r="3.8" fill="none" stroke={c} strokeWidth="1.2" /><path d="M5 1.2 A3.8 3.8 0 0 1 5 8.8 Z" fill={c} /></>}
        {status === 'pendiente' && <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".75" />}
      </svg>
    </span>
  );
}

/**
 * Un libro físico construido con caras: portada (con bisagra), cara interna de la
 * portada, primera página, contraportada, lomo, canto de páginas y cabeza.
 *
 * target (lo que pide el estante): 'shelf' | 'front' | 'inside' | 'back'
 * phase  (lo que se ve):           'rest' | 'out' | 'front' | 'inside' | 'back'
 *
 * Secuencia: rest → out → front → inside (portada abierta) → back → out → rest
 * Cada cambio de target arma la ruta física (p. ej. cerrar la portada antes de girar)
 * y se puede interrumpir en cualquier punto.
 */
export const DUR = { out: 420, turn: 820, open: 760, close: 560, flip: 720, back: 640, in: 460 };

const toFront = (cur) =>
  cur === 'rest' ? ['out', 'front'] : cur === 'out' ? ['front'] : cur === 'front' ? [] : ['front'];

function routeTo(cur, target) {
  if (target === 'front') return toFront(cur);
  if (target === 'inside') return cur === 'inside' ? [] : [...toFront(cur), 'inside'];
  if (target === 'back') return cur === 'back' ? [] : cur === 'front' ? ['back'] : [...toFront(cur), 'back'];
  // shelf
  if (cur === 'inside') return ['front', 'out', 'rest'];
  if (cur === 'front' || cur === 'back') return ['out', 'rest'];
  return cur === 'rest' ? [] : ['rest'];
}

/** Cuánto dura llegar a `next` viniendo de `prev` */
function stepDuration(prev, next, returning) {
  if (next === 'out') return returning ? DUR.back : DUR.out;
  if (next === 'front') return prev === 'inside' ? DUR.close : prev === 'back' ? DUR.flip : DUR.turn;
  if (next === 'inside') return DUR.open;
  if (next === 'back') return DUR.flip;
  return DUR.in;
}

function Book3D({ book, info, slot, coverWidth, target, dx, lift, pullZ, frontZ, openZ, onActivate, reducedMotion }) {
  const { t, cat } = useI18n();
  const [phase, setPhase] = useState('rest');
  const [prevPhase, setPrevPhase] = useState('rest');
  const phaseRef = useRef('rest');
  const returningRef = useRef(false);
  const timer = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    returningRef.current = target === 'shelf';
    const path = routeTo(phaseRef.current, target);
    const d = reducedMotion ? 0 : 1;
    const step = (i) => {
      if (i >= path.length) return;
      const prev = phaseRef.current, next = path[i];
      phaseRef.current = next;
      setPrevPhase(prev);
      setPhase(next);
      timer.current = setTimeout(() => step(i + 1), stepDuration(prev, next, returningRef.current) * d);
    };
    step(0);
    return () => clearTimeout(timer.current);
  }, [target, reducedMotion]);

  const W = coverWidth;
  const H = slot.height;
  const T = slot.width;
  const spine = info.spine;
  const ink = css(info.text);
  const spineDark = shade(spine, -0.28);
  const format = normFormat(book.format);
  const status = normStatus(book.readStatus);
  const badge = Math.max(6, Math.min(10, T - 4));
  const notes = Array.isArray(book.notes) ? book.notes : [];
  const summary = book.note || book.description || '';

  const ease = 'cubic-bezier(.22,.8,.24,1)';
  const dur = reducedMotion ? 1 : stepDuration(prevPhase, phase, returningRef.current);
  let transform;
  switch (phase) {
    case 'out':
      transform = `translate3d(0px, -6px, ${pullZ}px) rotateY(90deg)`; break;
    case 'front':
      transform = `translate3d(${dx}px, ${-lift}px, ${frontZ}px) rotateY(0deg)`; break;
    case 'inside':
      // el libro se corre medio ancho para que la doble página quede centrada
      transform = `translate3d(${dx + W / 2}px, ${-lift}px, ${openZ}px) rotateY(0deg)`; break;
    case 'back':
      transform = `translate3d(${dx}px, ${-lift}px, ${frontZ}px) rotateY(180deg)`; break;
    default:
      transform = 'translate3d(0px, 0px, 0px) rotateY(90deg)';
  }
  const curve = phase === 'out' && !returningRef.current ? 'cubic-bezier(.3,.7,.3,1)' : phase === 'rest' ? 'cubic-bezier(.4,0,.2,1)' : ease;
  const transition = `transform ${dur}ms ${curve}`;
  const coverOpen = phase === 'inside';
  const coverTransition = `transform ${reducedMotion ? 1 : coverOpen ? DUR.open : DUR.close}ms cubic-bezier(.45,.05,.2,1)`;

  const titleSize = Math.max(8, Math.min(13, T * 0.42));
  const label =
    phase === 'rest'
      ? t('book.pull', { title: book.title, author: book.author, format: t(`format.${format}`), status: t(`status.${status}`) })
    : t(target === 'back' ? 'book.return' : target === 'inside' ? 'book.seeBack' : 'book.open');

  return (
    <div
      className={`bs-slot ${phase !== 'rest' ? 'is-active' : ''} is-${format}`}
      style={{ left: slot.x, width: T, height: H }}
    >
      <div
        role="button"
        tabIndex={0}
        className={`bs-book is-${phase}`}
        aria-label={label}
        aria-pressed={phase !== 'rest'}
        onClick={(e) => { e.stopPropagation(); onActivate(book.id); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onActivate(book.id); }
        }}
        style={{ width: W, height: H, left: (T - W) / 2, transform, transition }}
      >
        {/* Portada con bisagra en el lomo: exterior + cara interna (resumen) */}
        <span
          className="bs-hinge-group"
          style={{
            width: W, height: H,
            transform: `translateZ(${T / 2}px) rotateY(${coverOpen ? -179.5 : 0}deg)`,
            transition: coverTransition,
          }}
        >
          <span
            className="bs-face bs-front"
            style={{ width: W, height: H, backgroundImage: book.cover ? `url("${book.cover}")` : undefined }}
          >
            {book.cover ? null : <span className="bs-nocover" style={{ background: css(spine), color: ink }}>{book.title}</span>}
            <span className="bs-hinge" />
          </span>
          <span
            className="bs-face bs-inner bs-inner-left"
            style={{ width: W, height: H, transform: 'rotateY(180deg)', '--tint': css(shade(spine, 0.82)) }}
          >
            <span className="bs-inner-kicker">{t('book.summary')}</span>
            <span className="bs-inner-title">{book.title}</span>
            {book.categories?.length ? <span className="bs-inner-cats">{book.categories.map(cat).join(' · ')}</span> : null}
            <span className="bs-inner-text">{summary || t('book.noSummary')}</span>
            <span className="bs-inner-foot">
              <span>{t(`format.${format}`)}</span>
              <span><i style={{ background: READ_STATUS[status].color }} />{t(`status.${status}`)}</span>
            </span>
          </span>
        </span>

        {/* Primera página: notas */}
        <span
          className="bs-face bs-inner bs-inner-right"
          style={{ width: W - 5, height: H - 6, top: 3, left: 1, transform: `translateZ(${T / 2 - 1.5}px)` }}
        >
          <span className="bs-inner-kicker">{t('book.notes')}{notes.length ? ` · ${notes.length}` : ''}</span>
          {notes.length ? (
            <span className="bs-notes">
              {notes.map((n) => (
                <span key={n.id} className="bs-note">
                  {n.page ? <b>p. {n.page}</b> : null}
                  <span>{n.text}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="bs-inner-text bs-muted">{t('book.noNotes')}</span>
          )}
          <span className="bs-inner-foot"><span>{book.author}</span>{book.pages ? <span>{t('book.pages', { n: book.pages })}</span> : null}</span>
        </span>

        {/* Contraportada */}
        <span
          className="bs-face bs-back"
          style={{
            width: W, height: H,
            color: book.backCover ? '#fbf7ef' : ink,
            background: book.backCover
              ? `linear-gradient(180deg, rgb(12 10 8 / .62), rgb(12 10 8 / .78)), center / cover no-repeat url("${book.backCover}")`
              : `linear-gradient(160deg, ${css(shade(spine, 0.06))}, ${css(shade(spine, -0.16))})`,
            transform: `rotateY(180deg) translateZ(${T / 2}px)`,
          }}
        >
          <span className="bs-back-title">{book.title}</span>
          <span className="bs-back-desc">{book.description || book.note}</span>
          <span className="bs-back-tags">
            <span>{t(`format.${format}`)}</span>
            <span style={{ background: READ_STATUS[status].color, color: '#1a140d', borderColor: 'transparent' }}>{t(`status.${status}`)}</span>
          </span>
          <span className="bs-back-meta">
            <span>{book.author}</span>
            {book.pages ? <span>{t('book.pages', { n: book.pages })}</span> : null}
          </span>
        </span>

        {/* Lomo */}
        <span
          className="bs-face bs-spine"
          style={{
            width: T, height: H, left: (W - T) / 2, color: ink,
            background: `linear-gradient(90deg, ${css(spineDark)} 0%, ${css(spine)} 18%, ${css(shade(spine, 0.08))} 50%, ${css(spine)} 82%, ${css(spineDark)} 100%)`,
            transform: `rotateY(-90deg) translateZ(${W / 2}px)`,
          }}
        >
          <span className="bs-spine-text" style={{ fontSize: titleSize, lineHeight: `${T}px` }}>
            <span className="bs-spine-title">{book.title}</span>
            <span className="bs-spine-author" style={{ fontSize: titleSize * 0.82 }}>{book.author}</span>
          </span>
          <SpineBadges format={format} status={status} size={badge} ink={ink} />
        </span>

        {/* Canto (bloque de páginas) */}
        <span
          className="bs-face bs-pages"
          style={{ width: T - 2, height: H - 6, left: (W - T) / 2 + 1, top: 3, transform: `rotateY(90deg) translateZ(${W / 2 - 3}px)` }}
        />

        {/* Cabeza superior */}
        <span
          className="bs-face bs-top"
          style={{ width: W - 4, height: T - 2, left: 2, top: (H - T) / 2 + 1, transform: `rotateX(90deg) translateZ(${H / 2 - 3}px)` }}
        />
      </div>
    </div>
  );
}

export default memo(Book3D);
