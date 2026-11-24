// Menú flotante de la estantería: buscar, filtros, categorías, orden y menú (apariencia, idioma, agregar).
import { FORMATS, READ_STATUS } from '../bookshelf/index.js';
import { categoryHue, fold, SEARCH_FIELDS, SORTS } from '../search.js';
import { useI18n, LANGS } from '../i18n.jsx';
import { usePrefs, FONTS } from '../prefs.jsx';
import FloatBar, { FloatChips, FloatFoot, FloatItem, FloatSection } from './FloatMenu.jsx';

const S = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
export const Icon = {
  search: <svg {...S}><circle cx="8.8" cy="8.8" r="5.6" /><path d="m13.2 13.2 4 4" /></svg>,
  filters: <svg {...S}><path d="M3 5.5h8M15 5.5h2M3 14.5h2M9 14.5h8" /><circle cx="13" cy="5.5" r="2" /><circle cx="7" cy="14.5" r="2" /></svg>,
  tag: <svg {...S}><path d="M10.6 2.8H16a1.2 1.2 0 0 1 1.2 1.2v5.4a1.2 1.2 0 0 1-.35.85l-6.6 6.6a1.2 1.2 0 0 1-1.7 0l-5.4-5.4a1.2 1.2 0 0 1 0-1.7l6.6-6.6a1.2 1.2 0 0 1 .85-.35Z" /><circle cx="13.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" /></svg>,
  sort: <svg {...S}><path d="M6 3.5v13M3 13.5l3 3 3-3M14 16.5v-13M11 6.5l3-3 3 3" /></svg>,
  menu: <svg {...S}><path d="M3.5 6h13M3.5 10h13M3.5 14h13" /></svg>,
  sun: <svg {...S}><circle cx="10" cy="10" r="3.4" /><path d="M10 2v1.8M10 16.2V18M2 10h1.8M16.2 10H18M4.3 4.3l1.3 1.3M14.4 14.4l1.3 1.3M4.3 15.7l1.3-1.3M14.4 5.6l1.3-1.3" /></svg>,
  moon: <svg {...S}><path d="M16.2 12.4A6.6 6.6 0 0 1 7.6 3.8a6.6 6.6 0 1 0 8.6 8.6Z" /></svg>,
  globe: <svg {...S}><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2 2.2 2.8 4.6 2.8 7s-.8 4.8-2.8 7c-2-2.2-2.8-4.6-2.8-7S8 5.2 10 3Z" /></svg>,
  plus: <svg {...S} strokeWidth="2"><path d="M10 4v12M4 10h12" /></svg>,
  shelf: <svg {...S}><path d="M3 16.5h14M5 16.5V5M8 16.5V7M11.5 16.5l-1.6-9 2.3-.4 1.6 9" /></svg>,
  az: <svg {...S}><path d="M3.5 15 6.5 5l3 10M4.5 12h4M12 6h4.5L12 14.5h4.5" /></svg>,
  person: <svg {...S}><circle cx="10" cy="6.8" r="3.2" /><path d="M3.8 17c.8-3.2 3.2-5 6.2-5s5.4 1.8 6.2 5" /></svg>,
  pages: <svg {...S}><path d="M4 6.5 10 4l6 2.5L10 9 4 6.5ZM4 10l6 2.5 6-2.5M4 13.5 10 16l6-2.5" /></svg>,
  bookmark: <svg {...S}><path d="M5.5 3.5h9v13l-4.5-3.2-4.5 3.2v-13Z" /></svg>,
};
const SORT_ICON = { estante: Icon.shelf, titulo: Icon.az, autor: Icon.person, paginas: Icon.pages, estado: Icon.bookmark };

export default function FloatControls({
  hasBooks, canEdit, onAdd, onSearch,
  scope, setScope, fFormat, setFFormat, fStatus, setFStatus,
  cats, setCats, toggleCat, sort, setSort,
  shownCats, catCounts, counts, visibleCount, anyActive,
}) {
  const { t, cat, lang, setLang } = useI18n();
  const { theme, setTheme, font, setFont } = usePrefs();
  const light = theme === 'claro';
  const info = anyActive ? t('count.of', { n: visibleCount, total: counts.total }) : t('count.books', { n: counts.total });
  const filtersOn = (scope !== 'todo') + (fFormat !== 'todos') + (fStatus !== 'todos');

  const items = [];
  if (hasBooks) {
    items.push(
      { key: 'buscar', label: t('float.search'), icon: Icon.search, onClick: onSearch },
      {
        key: 'filtros', label: t('float.filters'), icon: Icon.filters, dot: filtersOn > 0,
        panel: (close) => (
          <>
            <FloatSection title={t('search.inAria')}>
              <FloatChips label={t('search.inAria')} value={scope} onChange={setScope}
                options={SEARCH_FIELDS.map((k) => ({ value: k, label: t(`scope.${k}`) }))} />
            </FloatSection>
            <FloatSection title={t('filters.format')}>
              <FloatChips label={t('filters.format')} value={fFormat} onChange={setFFormat}
                options={[{ value: 'todos', label: t('filters.allFormats'), count: counts.total },
                  ...Object.keys(FORMATS).map((k) => ({ value: k, label: t(`format.${k}`), count: counts[k] }))]} />
            </FloatSection>
            <FloatSection title={t('filters.reading')}>
              <FloatChips label={t('filters.status')} value={fStatus} onChange={setFStatus}
                options={[{ value: 'todos', label: t('filters.anyShort'), count: counts.total },
                  ...Object.entries(READ_STATUS).map(([k, st]) => ({ value: k, label: t(`status.${k}`), dot: st.color, count: counts[k] }))]} />
            </FloatSection>
            <FloatFoot
              info={info}
              onReset={() => { setScope('todo'); setFFormat('todos'); setFStatus('todos'); }}
              resetLabel={t('float.reset')} resetDisabled={!filtersOn}
              onDone={() => close()} doneLabel={t('filters.done')}
            />
          </>
        ),
      },
      {
        key: 'categorias', label: t('filters.categories'), icon: Icon.tag, badge: cats.length || null,
        panel: (close) => (
          <>
            <div className="fl-list" role="group" aria-label={t('filters.categories')}>
              {shownCats.length ? shownCats.map((c) => (
                <FloatItem key={c} role="checkbox"
                  checked={cats.some((x) => fold(x) === fold(c))}
                  onClick={() => toggleCat(c)}
                  icon={<span className="fl-cat-dot" style={{ background: `hsl(${categoryHue(c)} 60% 66%)` }} />}
                  count={catCounts[fold(c)] || 0}
                >{cat(c)}</FloatItem>
              )) : <p className="fl-empty">{t('filters.noCats')}</p>}
            </div>
            <FloatFoot
              info={info}
              onReset={() => setCats([])} resetLabel={t('filters.clearCats')} resetDisabled={!cats.length}
              onDone={() => close()} doneLabel={t('filters.done')}
            />
          </>
        ),
      },
      {
        key: 'orden', label: t('filters.sort'), icon: Icon.sort, dot: sort !== 'estante',
        panel: (close) => (
          <div className="fl-list" role="radiogroup" aria-label={t('filters.sort')}>
            {SORTS.map((k) => (
              <FloatItem key={k} role="radio" checked={sort === k} icon={SORT_ICON[k]}
                onClick={() => { setSort(k); close(); }}>{t(`sort.${k}`)}</FloatItem>
            ))}
          </div>
        ),
      },
    );
  }
  items.push({
    key: 'menu', label: t('float.menu'), icon: Icon.menu,
    panel: (close) => (
      <>
        <div className="fl-list">
          <FloatItem role="switch" checked={light} icon={light ? Icon.sun : Icon.moon}
            onClick={() => setTheme(light ? 'oscuro' : 'claro')}
            trailing={<span className={`fl-switch ${light ? 'on' : ''}`} aria-hidden="true"><span /></span>}
          >{t('prefs.theme')}</FloatItem>
        </div>
        <FloatSection title={t('prefs.font')} role="radiogroup" ariaLabel={t('prefs.font')}>
          {FONTS.map((f) => (
            <FloatItem key={f} role="radio" checked={font === f} onClick={() => setFont(f)}
              icon={<span className={`fl-aa f-${f}`}>Aa</span>}
              hint={t(`font.${f}Hint`)}
            ><span className={`fl-font-name f-${f}`}>{t(`font.${f}`)}</span></FloatItem>
          ))}
        </FloatSection>
        <FloatSection title={t('lang.label')} role="radiogroup" ariaLabel={t('lang.label')}>
          {LANGS.map(([k, name, short]) => (
            <FloatItem key={k} role="radio" checked={lang === k} onClick={() => setLang(k)} lang={k}
              icon={<span className="fl-code">{short}</span>}
            >{name}</FloatItem>
          ))}
        </FloatSection>
        {canEdit ? (
          <div className="fl-list fl-sep">
            <FloatItem className="fl-accent" icon={Icon.plus} onClick={() => { close(false); onAdd(); }}>{t('float.add')}</FloatItem>
          </div>
        ) : null}
      </>
    ),
  });

  return <FloatBar items={items} ariaLabel={t('float.aria')} closeLabel={t('float.close')} />;
}
