// Preferencias de apariencia: tema (oscuro / claro) y fuente (clásica / editorial).
// Se guardan en este navegador y se aplican como atributos en <html>.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const THEMES = ['oscuro', 'claro'];
export const FONTS = ['clasica', 'editorial'];
const LS = { theme: 'mi-biblioteca.tema', font: 'mi-biblioteca.fuente' };

function read(key, allowed, fallback) {
  try { const v = localStorage.getItem(key); if (allowed.includes(v)) return v; } catch { /* sin almacenamiento */ }
  return fallback;
}
function write(key, v) { try { localStorage.setItem(key, v); } catch { /* sin almacenamiento */ } }

const Ctx = createContext({ theme: 'oscuro', font: 'clasica', setTheme: () => {}, setFont: () => {} });

export function PrefsProvider({ children }) {
  const [theme, setThemeState] = useState(() => read(LS.theme, THEMES, 'oscuro'));
  const [font, setFontState] = useState(() => read(LS.font, FONTS, 'clasica'));
  const setTheme = useCallback((v) => { setThemeState(v); write(LS.theme, v); }, []);
  const setFont = useCallback((v) => { setFontState(v); write(LS.font, v); }, []);
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.style.colorScheme = theme === 'claro' ? 'light' : 'dark';
  }, [theme]);
  useEffect(() => { document.documentElement.dataset.font = font; }, [font]);
  const value = useMemo(() => ({ theme, font, setTheme, setFont }), [theme, font, setTheme, setFont]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
