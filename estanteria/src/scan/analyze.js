// Lee título, autor, descripción y recorte a partir de las fotos.
// 1) Dentro de un artifact de Claude: capacidad `sample` con imágenes.
// 2) En tu servidor: POST /api/libros/analizar (la API llama a Anthropic con tu clave).
import { buildScanPrompt, parseScan } from './prompt.js';

const API = import.meta.env.VITE_API_URL || '/api';
let samplePromise = null;

function getSample() {
  if (!samplePromise) {
    samplePromise = (async () => {
      if (typeof window === 'undefined' || !window.claude?.use) return null;
      try {
        const sample = await window.claude.use('sample');
        if (!sample) return null;
        const limits = await sample.limits?.().catch(() => null);
        return limits && !limits.images ? null : sample;
      } catch { return null; }
    })();
  }
  return samplePromise;
}

/** ¿Hay lectura automática disponible en esta vista? */
export async function scanAvailable(source) {
  if (source === 'api') return true;
  return !!(await getSample());
}

/**
 * front/back: { blob, dataUrl } de la foto completa (ya reducida).
 * Devuelve el objeto del prompt (titulo, autor, descripcion, recortes...).
 */
export async function analyzeCovers({ front, back }, { source, token, signal, categories = [], lang = 'es' } = {}) {
  if (source !== 'api') {
    const sample = await getSample();
    if (!sample) throw Object.assign(new Error('Lectura automática no disponible'), { code: 'unavailable' });
    const images = [front.blob, back?.blob].filter(Boolean);
    const res = await sample(buildScanPrompt(categories, images.length === 2, lang), {
      images, modelTier: 'default', signal, cache: false,
    });
    return parseScan(res.text);
  }

  const r = await fetch(`${API}/libros/analizar`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ portada: front.dataUrl, contraportada: back?.dataUrl || null, categorias: categories, idioma: lang }),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return parseScan(await r.json());
}
