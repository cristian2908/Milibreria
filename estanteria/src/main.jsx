import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { LangProvider } from './i18n.jsx';
import { PrefsProvider } from './prefs.jsx';
import './app.css';

async function start() {
  // Las portadas de demo se dibujan en canvas: esperar fuentes para que el texto salga bien.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('600 40px Fraunces'),
        document.fonts.load('500 20px "IBM Plex Sans Condensed"'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {}
  createRoot(document.getElementById('root')).render(<PrefsProvider><LangProvider><App /></LangProvider></PrefsProvider>);
}
start();
