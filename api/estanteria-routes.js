// Rutas nuevas para agregar libros con fotos.
// Montar en api/index.js, DESPUÉS de definir `app`, `pool` y el middleware de auth:
//
//   require('./estanteria-routes')(app, pool, { auth: verificarToken, puedeEditar });
//
// Variables de entorno (.env) — basta con UNA de las dos claves:
//   OPENROUTER_API_KEY=sk-or-...        lectura GRATIS con modelos ":free" de OpenRouter
//                                       (límite: 20 por minuto y 50 por día; 1000/día si
//                                       alguna vez compraste ≥ 10 USD de créditos)
//   OPENROUTER_MODELS=amazon/nova-2-lite-v1:free,openrouter/free   (opcional, en orden)
//   ANTHROPIC_API_KEY=sk-ant-...        lectura con Claude (de pago)
//   ANTHROPIC_MODEL=claude-sonnet-5-5   (opcional)
//   IA_PROVEEDOR=auto | openrouter | anthropic   (auto: OpenRouter primero si hay clave,
//                                       y si falla, Claude si hay clave)
//   PORTADAS_DIR=/app/portadas          (volumen compartido con Nginx)
//   PORTADAS_URL=/portadas              (ruta pública)
//
// Sin dependencias nuevas: usa fetch de Node 20 y fs.

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const PORTADAS_DIR = process.env.PORTADAS_DIR || path.join(__dirname, 'portadas');
const PORTADAS_URL = (process.env.PORTADAS_URL || '/portadas').replace(/\/$/, '');
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
// Idea tomada de github.com/ceodaniyal/free-llm-image-to-text: OCR con modelos de visión
// gratuitos de OpenRouter (por defecto el mismo que usa ese proyecto).
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || 'amazon/nova-2-lite-v1:free,openrouter/free')
  .split(',').map((m) => m.trim()).filter(Boolean);
const MAX_IMG_BYTES = 4 * 1024 * 1024;

/** Categorías → arreglo de texto para la columna TEXT[] `categorias` (pg lo convierte solo) */
function limpiarCategorias(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  return v.map((c) => String(c || '').replace(/\s+/g, ' ').trim().slice(0, 40))
    .filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()))
    .slice(0, 12);
}

/** Valida la lista de notas del interior → JSON para la columna JSONB `notas` */
function limpiarNotas(v) {
  if (!Array.isArray(v)) return '[]';
  const out = v.slice(0, 200)
    .filter((n) => n && String(n.text || '').trim())
    .map((n) => ({
      id: String(n.id || crypto.randomBytes(4).toString('hex')).slice(0, 24),
      text: String(n.text).trim().slice(0, 800),
      page: n.page ? String(n.page).slice(0, 12) : null,
      date: /^\d{4}-\d{2}-\d{2}/.test(n.date || '') ? String(n.date).slice(0, 10) : null,
    }));
  return JSON.stringify(out);
}

// Copia de estanteria/src/scan/prompt.js — mantener iguales
const SCAN_PROMPT = `Eres el asistente de catalogación de una biblioteca personal.
Recibes la foto de la PORTADA de un libro (imagen 1) y, si existe, la de su CONTRAPORTADA (imagen 2).
Lee lo que está impreso y responde SOLO con un objeto JSON, sin texto adicional, con estas claves:

{
  "titulo": string,
  "subtitulo": string | null,
  "autor": string,                  // autores separados por ", "
  "editorial": string | null,
  "isbn": string | null,            // solo dígitos y X, si se ve (ISBN-13 preferido)
  "paginas": number | null,         // solo si está impreso; no lo inventes
  "idioma": string | null,
  "descripcion": string,            // resumen (máx. 380 caracteres) del texto de la contraportada, en el idioma indicado abajo
  "recorte_portada": {"x": n, "y": n, "w": n, "h": n} | null,
  "recorte_contraportada": {"x": n, "y": n, "w": n, "h": n} | null,
  "categorias": string[],          // 1 a 3 categorías de la lista dada; crea una nueva solo si ninguna sirve
  "confianza": "alta" | "media" | "baja",
  "texto_visible": string           // TODO el texto legible de las fotos, en orden de lectura, sin omitir textos pequeños (ISBN, editorial, colección); máx. 2000 caracteres
}

Los recortes son el rectángulo del libro dentro de cada imagen, valores 0–1 desde la esquina superior izquierda.
Reglas: no inventes datos que no se vean; usa null. Si la foto ya está recortada al libro, el recorte es {"x":0,"y":0,"w":1,"h":1}.`;

// Copia de estanteria/src/scan/completar.js — mantener iguales
function isbnValido(v) {
  const s = String(v || '').replace(/[^\dXx]/g, '').toUpperCase();
  if (s.length === 13 && /^\d{13}$/.test(s)) {
    const sum = [...s].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? s : null;
  }
  if (s.length === 10 && /^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((acc, d, i) => acc + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    return sum % 11 === 0 ? s : null;
  }
  return null;
}
function isbnsEnTexto(texto) {
  const out = [];
  const re = /(?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx]/g;
  for (const m of String(texto || '').matchAll(re)) {
    const ok = isbnValido(m[0]);
    if (ok && !out.includes(ok)) out.push(ok);
  }
  return out.sort((a, b) => b.length - a.length);
}
function paginasEnTexto(texto) {
  const m = /(\d{2,4})\s*(?:p[áa]ginas|p[áa]gs?\.?|pp\.?|pages)\b/i.exec(String(texto || ''));
  const n = m ? Number(m[1]) : NaN;
  return n >= 10 && n <= 5000 ? n : null;
}
function completarDesdeTexto(r) {
  const out = { ...(r || {}) };
  const texto = typeof out.texto_visible === 'string' ? out.texto_visible.slice(0, 4000) : '';
  out.texto_visible = texto || null;
  out.isbn = isbnValido(out.isbn) || isbnsEnTexto(texto)[0] || null;
  const pag = Number(out.paginas);
  out.paginas = pag >= 10 && pag <= 5000 ? Math.round(pag) : paginasEnTexto(texto);
  for (const k of ['titulo', 'subtitulo', 'autor', 'editorial', 'descripcion']) {
    if (typeof out[k] === 'string') out[k] = out[k].replace(/\s+/g, ' ').trim() || null;
  }
  return out;
}

// ── Proveedores de lectura ─────────────────────────────────────────────
class ErrorLectura extends Error {
  constructor(msg, status, codigo) { super(msg); this.status = status; this.codigo = codigo; }
}

async function leerConAnthropic(prompt, imgs) {
  const content = [
    ...imgs.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } })),
    { type: 'text', text: prompt },
  ];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) {
    console.error('anthropic:', r.status, (await r.text()).slice(0, 300));
    throw new ErrorLectura('Claude no respondió', r.status, r.status === 429 ? 'rate_limited' : 'fallo');
  }
  const data = await r.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { datos: parseJson(text), proveedor: 'anthropic', modelo: MODEL };
}

async function leerConOpenRouter(prompt, imgs) {
  const content = [
    { type: 'text', text: prompt },
    ...imgs.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.base64}` } })),
  ];
  let ultimo = null;
  for (const modelo of OPENROUTER_MODELS) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'x-title': 'Mi Biblioteca',
        },
        body: JSON.stringify({ model: modelo, temperature: 0, max_tokens: 1500, messages: [{ role: 'user', content }] }),
        signal: AbortSignal.timeout(60000),
      });
      if (r.status === 429) {
        // límite de modelos gratuitos (por minuto o por día): otro modelo :free no lo evita
        console.error('openrouter 429:', (await r.text()).slice(0, 200));
        throw new ErrorLectura('Se alcanzó el límite gratuito de OpenRouter', 429, 'rate_limited');
      }
      if (!r.ok) { ultimo = new ErrorLectura(`OpenRouter ${r.status}`, r.status, 'fallo'); console.error('openrouter:', modelo, r.status, (await r.text()).slice(0, 200)); continue; }
      const data = await r.json();
      if (data.error) { ultimo = new ErrorLectura(data.error.message || 'OpenRouter', 502, 'fallo'); console.error('openrouter:', modelo, data.error.message); continue; }
      const text = data.choices?.[0]?.message?.content;
      const plano = Array.isArray(text) ? text.map((c) => c.text || '').join('') : String(text || '');
      if (!plano.trim()) { ultimo = new ErrorLectura('Respuesta vacía', 502, 'fallo'); continue; }
      return { datos: parseJson(plano), proveedor: 'openrouter', modelo: data.model || modelo };
    } catch (e) {
      if (e.codigo === 'rate_limited') throw e;
      ultimo = e; console.error('openrouter:', modelo, e.message);
    }
  }
  throw ultimo || new ErrorLectura('OpenRouter no respondió', 502, 'fallo');
}

/** Orden de proveedores según IA_PROVEEDOR y las claves disponibles. */
function proveedores() {
  const hayOR = !!process.env.OPENROUTER_API_KEY, hayAN = !!process.env.ANTHROPIC_API_KEY;
  const pref = (process.env.IA_PROVEEDOR || 'auto').toLowerCase();
  if (pref === 'openrouter') return hayOR ? [leerConOpenRouter] : [];
  if (pref === 'anthropic') return hayAN ? [leerConAnthropic] : [];
  return [hayOR && leerConOpenRouter, hayAN && leerConAnthropic].filter(Boolean);
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[3], 'base64');
  if (!buf.length || buf.length > MAX_IMG_BYTES) return null;
  return { mime: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2], buf, base64: m[3] };
}

function parseJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Respuesta sin JSON');
  return JSON.parse(s.slice(a, b + 1));
}

module.exports = Object.assign(function estanteriaRoutes(app, pool, { auth, puedeEditar = (req) => req.user?.rol !== 'lector' } = {}) {
  if (!auth) throw new Error('estanteria-routes: falta el middleware auth');
  const big = express.json({ limit: '10mb' });

  const soloEditores = (req, res, next) =>
    puedeEditar(req) ? next() : res.status(403).json({ error: 'Tu rol no puede agregar libros' });

  // ── Subir portada / contraportada ────────────────────────────────────
  app.post('/api/portadas', big, auth, soloEditores, async (req, res) => {
    const img = parseDataUrl(req.body?.imagen);
    if (!img) return res.status(400).json({ error: 'Imagen inválida (JPEG/PNG/WebP, máx. 4 MB)' });
    try {
      await fs.mkdir(PORTADAS_DIR, { recursive: true });
      const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${img.ext}`;
      await fs.writeFile(path.join(PORTADAS_DIR, name), img.buf);
      res.status(201).json({ url: `${PORTADAS_URL}/${name}` });
    } catch (e) {
      console.error('portadas:', e.message);
      res.status(500).json({ error: 'No se pudo guardar la imagen' });
    }
  });

  // ── Leer datos de las fotos (OpenRouter gratis y/o Claude) ──────────
  app.post('/api/libros/analizar', big, auth, soloEditores, async (req, res) => {
    const lista = proveedores();
    if (!lista.length) return res.status(503).json({ error: 'Falta OPENROUTER_API_KEY o ANTHROPIC_API_KEY', codigo: 'unavailable' });
    const front = parseDataUrl(req.body?.portada);
    const back = req.body?.contraportada ? parseDataUrl(req.body.contraportada) : null;
    if (!front) return res.status(400).json({ error: 'Falta la foto de la portada' });

    const prompt = SCAN_PROMPT +
      `\n\nCategorías existentes: ${limpiarCategorias(req.body?.categorias).join(' | ') || '(ninguna)'}.` +
      `\nEscribe "descripcion" en ${req.body?.idioma === 'en' ? 'inglés' : 'español'}.` +
      `\nImágenes adjuntas: ${back ? 'portada y contraportada' : 'solo portada'}.`;
    const imgs = [front, back].filter(Boolean);

    let ultimo = null;
    for (const leer of lista) {
      try {
        const { datos, proveedor, modelo } = await leer(prompt, imgs);
        return res.json({ ...completarDesdeTexto(datos), _proveedor: proveedor, _modelo: modelo });
      } catch (e) {
        ultimo = e;
        console.error('analizar:', e.message);
      }
    }
    const status = ultimo?.codigo === 'rate_limited' ? 429 : 502;
    res.status(status).json({ error: ultimo?.message || 'No se pudieron leer las fotos', codigo: ultimo?.codigo || 'fallo' });
  });

  // ── ¿Con qué se leen las fotos? (para el texto de la interfaz) ──────
  app.get('/api/libros/analizar/estado', auth, (req, res) => {
    const lista = proveedores().map((f) => (f === leerConOpenRouter ? 'openrouter' : 'anthropic'));
    res.json({ disponible: lista.length > 0, proveedores: lista, modelos: lista[0] === 'openrouter' ? OPENROUTER_MODELS : [MODEL] });
  });

  // ── Crear libro con todos los campos de la estantería ────────────────
  // Si ya tienes POST /api/libros, reemplázalo por este o copia la lista de columnas.
  const COLS = ['titulo', 'autor', 'quien', 'prio', 'genero', 'nota', 'comprado', 'via_foto',
    'descripcion', 'paginas', 'portada_url', 'contraportada_url', 'portada_ratio', 'color_lomo',
    'formato', 'estado_lectura', 'nota_resumen', 'notas', 'categorias', 'isbn', 'editorial'];

  app.post('/api/libros', express.json({ limit: '1mb' }), auth, soloEditores, async (req, res) => {
    const b = req.body || {};
    if (!String(b.titulo || '').trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    const v = {
      ...b,
      titulo: String(b.titulo).trim().slice(0, 300),
      paginas: Number.isFinite(+b.paginas) && +b.paginas > 0 && +b.paginas <= 5000 ? Math.round(+b.paginas) : null,
      formato: b.formato === 'virtual' ? 'virtual' : 'fisico',
      estado_lectura: ['pendiente', 'leyendo', 'leido'].includes(b.estado_lectura) ? b.estado_lectura : 'pendiente',
      portada_ratio: +b.portada_ratio > 0.4 && +b.portada_ratio < 1.3 ? +b.portada_ratio : null,
      portada_url: /^\/portadas\/[\w.-]+$|^https:\/\//.test(b.portada_url || '') ? b.portada_url : '',
      contraportada_url: /^\/portadas\/[\w.-]+$|^https:\/\//.test(b.contraportada_url || '') ? b.contraportada_url : '',
      isbn: b.isbn ? String(b.isbn).replace(/[^\dX]/gi, '').slice(0, 13) : null,
      notas: b.notas !== undefined ? limpiarNotas(b.notas) : undefined,
      categorias: b.categorias !== undefined ? limpiarCategorias(b.categorias) : undefined,
    };
    const cols = COLS.filter((c) => v[c] !== undefined);
    const vals = cols.map((c) => v[c]);
    cols.push('usuario_id'); vals.push(req.user.id);
    if (v.estado_lectura === 'leido') { cols.push('leido_en'); vals.push(new Date()); }
    try {
      const { rows } = await pool.query(
        `INSERT INTO libros (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        vals
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      console.error('crear libro:', e.message);
      res.status(500).json({ error: 'No se pudo guardar el libro' });
    }
  });
}, { limpiarNotas, limpiarCategorias, completarDesdeTexto, isbnValido });
