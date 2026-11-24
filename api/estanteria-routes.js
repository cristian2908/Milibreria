// Rutas nuevas para agregar libros con fotos.
// Montar en api/index.js, DESPUÉS de definir `app`, `pool` y el middleware de auth:
//
//   require('./estanteria-routes')(app, pool, { auth: verificarToken, puedeEditar });
//
// Variables de entorno (.env):
//   ANTHROPIC_API_KEY=sk-ant-...        (la misma que usabas para "Agregar por foto")
//   ANTHROPIC_MODEL=claude-sonnet-5-5   (opcional)
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
  "confianza": "alta" | "media" | "baja"
}

Los recortes son el rectángulo del libro dentro de cada imagen, valores 0–1 desde la esquina superior izquierda.
Reglas: no inventes datos que no se vean; usa null. Si la foto ya está recortada al libro, el recorte es {"x":0,"y":0,"w":1,"h":1}.`;

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

  // ── Leer datos de las fotos con Claude ───────────────────────────────
  app.post('/api/libros/analizar', big, auth, soloEditores, async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Falta ANTHROPIC_API_KEY' });
    const front = parseDataUrl(req.body?.portada);
    const back = req.body?.contraportada ? parseDataUrl(req.body.contraportada) : null;
    if (!front) return res.status(400).json({ error: 'Falta la foto de la portada' });

    const content = [
      { type: 'image', source: { type: 'base64', media_type: front.mime, data: front.base64 } },
      ...(back ? [{ type: 'image', source: { type: 'base64', media_type: back.mime, data: back.base64 } }] : []),
      {
        type: 'text',
        text: SCAN_PROMPT +
          `\n\nCategorías existentes: ${limpiarCategorias(req.body?.categorias).join(' | ') || '(ninguna)'}.` +
          `\nEscribe "descripcion" en ${req.body?.idioma === 'en' ? 'inglés' : 'español'}.` +
          `\nImágenes adjuntas: ${back ? 'portada y contraportada' : 'solo portada'}.`,
      },
    ];

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, messages: [{ role: 'user', content }] }),
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) {
        console.error('anthropic:', r.status, (await r.text()).slice(0, 300));
        return res.status(502).json({ error: 'El servicio de lectura no respondió' });
      }
      const data = await r.json();
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      res.json(parseJson(text));
    } catch (e) {
      console.error('analizar:', e.message);
      res.status(502).json({ error: 'No se pudieron leer las fotos' });
    }
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
}, { limpiarNotas, limpiarCategorias });
