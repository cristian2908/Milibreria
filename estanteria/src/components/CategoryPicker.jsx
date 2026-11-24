import { useState } from 'react';
import { categoryHue, cleanCategory, fold } from '../search.js';
import { useI18n } from '../i18n.jsx';

/** Chips para asignar varias categorías a un libro + crear una nueva. */
export default function CategoryPicker({ value = [], all = [], onChange, label: labelProp, suggested = [] }) {
  const { t, cat } = useI18n();
  const label = labelProp || t('cats.label');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const has = (c) => value.some((v) => fold(v) === fold(c));
  const sug = new Set(suggested.map(fold));

  const toggle = (c) => onChange(has(c) ? value.filter((v) => fold(v) !== fold(c)) : [...value, c]);

  const create = () => {
    const c = cleanCategory(draft);
    if (!c) return;
    const existing = all.find((a) => fold(a) === fold(c) || fold(cat(a)) === fold(c));
    const name = existing || c;
    if (!has(name)) onChange([...value, name]);
    setDraft(''); setAdding(false);
  };

  const options = [...all, ...value.filter((v) => !all.some((a) => fold(a) === fold(v)))];

  return (
    <div className="field">
      <span className="field-label">{label}{value.length ? ` · ${value.length}` : ''}</span>
      <div className="cat-picker" role="group" aria-label={label}>
        {options.map((c) => (
          <button
            key={c} type="button"
            className={`cat ${has(c) ? 'on' : ''} ${sug.has(fold(c)) && !has(c) ? 'sug' : ''}`}
            style={{ '--h': categoryHue(c) }}
            aria-pressed={has(c)}
            onClick={() => toggle(c)}
          >
            {has(c) ? '✓ ' : ''}{cat(c)}
          </button>
        ))}
        {adding ? (
          <span className="cat-new">
            <input
              autoFocus value={draft} maxLength={40} placeholder={t('cats.newPh')}
              aria-label={t('cats.newAria')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); create(); }
                if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setDraft(''); }
              }}
            />
            <button type="button" className="btn btn-primary sm" onClick={create} disabled={!draft.trim()}>{t('cats.create')}</button>
          </span>
        ) : (
          <button type="button" className="cat cat-add" onClick={() => setAdding(true)}>{t('cats.new')}</button>
        )}
      </div>
    </div>
  );
}
