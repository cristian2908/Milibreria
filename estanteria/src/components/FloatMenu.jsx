import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * Barra flotante (píldora oscura abajo al centro) con botones de icono.
 * Cada botón abre un panel flotante redondeado encima de la barra; un "piquito"
 * señala el botón activo. Un solo panel a la vez. Se cierra con Esc, tocando
 * fuera o tocando otra vez el mismo botón.
 *
 * items: [{ key, label, icon, badge?, dot?, onClick?, panel?: (close) => node, title? }]
 */
export default function FloatBar({ items, ariaLabel, closeLabel }) {
  const [openKey, setOpenKey] = useState(null);
  const btns = useRef({});
  const panel = useRef(null);
  const bar = useRef(null);
  const [nub, setNub] = useState(null);
  const baseId = useId();
  const current = items.find((it) => it.key === openKey && it.panel);

  const close = useCallback((focusBack = true) => {
    setOpenKey((k) => {
      if (focusBack && k) btns.current[k]?.focus({ preventScroll: true });
      return null;
    });
  }, []);

  // Si el panel abierto deja de existir (p. ej. al vaciar la estantería), cerrarlo.
  useEffect(() => { if (openKey && !current) setOpenKey(null); }, [openKey, current]);

  const placeNub = useCallback(() => {
    const b = btns.current[openKey]?.getBoundingClientRect();
    const p = panel.current?.getBoundingClientRect();
    if (!b || !p) return;
    const x = b.left + b.width / 2 - p.left;
    setNub(Math.max(28, Math.min(p.width - 28, x)));
  }, [openKey]);

  useLayoutEffect(() => { if (current) placeNub(); }, [current, placeNub]);

  useEffect(() => {
    if (!current) return undefined;
    const onDown = (e) => {
      if (panel.current?.contains(e.target) || bar.current?.contains(e.target)) return;
      close(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', placeNub);
    const raf = requestAnimationFrame(() => {
      const p = panel.current;
      (p?.querySelector('[aria-checked="true"]') || p?.querySelector('button, input, [tabindex]'))?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', placeNub);
    };
    // Solo al abrir otro panel, no en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  return (
    <>
      {current ? (
        <div className="fl-layer">
          <div
            ref={panel}
            id={`${baseId}-${current.key}`}
            className="fl-panel"
            role="dialog"
            aria-label={current.label}
            style={nub != null ? { '--nub': `${nub}px` } : undefined}
            onBlur={(e) => {
              const to = e.relatedTarget;
              if (to && !e.currentTarget.contains(to) && !bar.current?.contains(to)) close(false);
            }}
          >
            <div className="fl-head">
              <h2>{current.label}</h2>
              <button type="button" className="fl-x" aria-label={closeLabel} onClick={() => close()}>
                <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div className="fl-body">{current.panel(close)}</div>
          </div>
        </div>
      ) : null}

      <div className="fl-bar-wrap">
        <nav ref={bar} className="fl-bar" aria-label={ariaLabel}>
          {items.map((it) => {
            const isOpen = it.key === openKey;
            return (
              <button
                key={it.key}
                ref={(el) => { btns.current[it.key] = el; }}
                type="button"
                className={`fl-btn ${isOpen ? 'open' : ''} ${it.accent ? 'accent' : ''}`}
                aria-label={it.label}
                title={it.title || it.label}
                {...(it.panel ? { 'aria-expanded': isOpen, 'aria-haspopup': 'dialog', 'aria-controls': isOpen ? `${baseId}-${it.key}` : undefined } : {})}
                onClick={() => {
                  if (it.panel) setOpenKey((k) => (k === it.key ? null : it.key));
                  else { setOpenKey(null); it.onClick?.(); }
                }}
              >
                {it.icon}
                {it.badge ? <i className="fl-badge">{it.badge}</i> : it.dot ? <i className="fl-dot" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}

/** Fila de menú (estilo .menu-item): icono, texto, conteo y marca. */
export function FloatItem({ icon, children, hint, count, checked, role, onClick, trailing, className = '', style, lang }) {
  const selectable = role === 'radio' || role === 'checkbox' || role === 'switch';
  return (
    <button
      type="button"
      role={role}
      aria-checked={selectable ? !!checked : undefined}
      className={`fl-item ${checked ? 'on' : ''} ${className}`}
      onClick={onClick}
      style={style}
      lang={lang}
    >
      {icon ? <span className="fl-ico" aria-hidden="true">{icon}</span> : null}
      <span className="fl-text">
        <span className="fl-label">{children}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      {count != null ? <span className="fl-count">{count}</span> : null}
      {trailing}
      {(role === 'radio' || role === 'checkbox') ? (
        <span className={`fl-check ${checked ? 'on' : ''}`} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.6-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      ) : null}
    </button>
  );
}

/** Opciones en píldoras dentro de un panel (una sola elección). */
export function FloatChips({ label, options, value, onChange }) {
  return (
    <div className="fl-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={`fl-chip ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.dot ? <span className="fl-chip-dot" style={{ background: o.dot }} aria-hidden="true" /> : null}
          {o.label}
          {o.count != null ? <i>{o.count}</i> : null}
        </button>
      ))}
    </div>
  );
}

export function FloatSection({ title, children, role, ariaLabel }) {
  return (
    <section className="fl-section" role={role} aria-label={ariaLabel}>
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  );
}

export function FloatFoot({ info, onReset, resetLabel, resetDisabled, onDone, doneLabel }) {
  return (
    <div className="fl-foot">
      <span className="fl-info" aria-live="polite">{info}</span>
      {onReset ? <button type="button" className="fl-link" disabled={resetDisabled} onClick={onReset}>{resetLabel}</button> : null}
      {onDone ? <button type="button" className="fl-done" onClick={onDone}>{doneLabel}</button> : null}
    </div>
  );
}
