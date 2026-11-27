# Cambios en `api/index.js` para la estantería

## 0. Agregar libros (manual y con fotos) — `estanteria-routes.js`

Trae tres rutas listas: `POST /api/portadas` (guarda la foto), `POST /api/libros/analizar`
(lee portada y contraportada con un modelo gratuito de OpenRouter o con Claude), `GET /api/libros/analizar/estado` y `POST /api/libros` (crea el libro con todos los
campos nuevos). Móntalas **antes** de `app.use(express.json())`, porque las fotos pesan
más que el límite por defecto (100 KB) del parser global:

```js
const estanteriaRoutes = require('./estanteria-routes');
// ... después de crear app, pool y el middleware verificarToken:
estanteriaRoutes(app, pool, { auth: verificarToken });
app.use(express.json());            // tu línea existente, después
```

Si ya tienes un `POST /api/libros`, bórralo o déjalo después: Express usa la primera
ruta que coincide. Esta valida el título, las páginas (1–5000), el formato, el
estado, el ISBN y que las imágenes vengan de `/portadas/`.

`.env`:

```
OPENROUTER_API_KEY=sk-or-...      # gratis (50 lecturas/día); basta con esta o con la de Anthropic
IA_PROVEEDOR=auto                 # auto | openrouter | anthropic
ANTHROPIC_API_KEY=sk-ant-...      # opcional, de pago (respaldo)
ANTHROPIC_MODEL=claude-sonnet-5-5
PORTADAS_DIR=/app/portadas
PORTADAS_URL=/portadas
```

`docker-compose.yml` (el mismo volumen en la API y en Nginx):

```yaml
  api:
    volumes:
      - ./portadas:/app/portadas
  nginx:
    volumes:
      - ./portadas:/usr/share/nginx/portadas:ro
```

y en `nginx/default.conf` sube el límite de cuerpo para las fotos:

```nginx
client_max_body_size 12m;
```

El rol `lector` recibe 403 en las tres rutas.

El repositorio todavía no tiene tu `index.js`, así que estos cambios se aplican a mano o
con Claude Code en el servidor siguiendo `DESPLIEGUE.md`.

## 1. Crear las columnas al arrancar

En `initDB()`, después del `CREATE TABLE IF NOT EXISTS libros (...)`, ejecuta el
contenido de `migrations/002_estanteria.sql` (o léelo con `fs.readFileSync`).

## 2. Aceptar los campos nuevos en POST y PUT `/api/libros`

```js
const CAMPOS_ESTANTE = ['portada_url', 'paginas', 'descripcion', 'color_lomo', 'portada_ratio', 'orden_estante'];

function limpiarEstante(body) {
  const out = {};
  if (typeof body.portada_url === 'string') out.portada_url = body.portada_url.slice(0, 500);
  if (body.paginas != null) {
    const n = parseInt(body.paginas, 10);
    out.paginas = Number.isFinite(n) && n > 0 && n <= 5000 ? n : null;
  }
  if (typeof body.descripcion === 'string') out.descripcion = body.descripcion.slice(0, 2000);
  if (typeof body.color_lomo === 'string')
    out.color_lomo = /^#[0-9a-f]{6}$/i.test(body.color_lomo) ? body.color_lomo : '';
  if (body.portada_ratio != null) {
    const r = Number(body.portada_ratio);
    out.portada_ratio = r > 0.4 && r < 1.3 ? r : null;
  }
  if (body.orden_estante != null) out.orden_estante = parseInt(body.orden_estante, 10) || null;
  return out;
}
```

En el INSERT/UPDATE, añade las claves de `limpiarEstante(req.body)` a las columnas
que ya guardas (`titulo, autor, quien, prio, genero, nota, ...`).

## 2b. Formato, lectura y nota (migración 003)

```js
function limpiarColeccion(body) {
  const out = {};
  if (['fisico', 'virtual'].includes(body.formato)) out.formato = body.formato;
  if (['pendiente', 'leyendo', 'leido'].includes(body.estado_lectura)) {
    out.estado_lectura = body.estado_lectura;
    out.leido_en = body.estado_lectura === 'leido' ? new Date() : null;
  }
  if (typeof body.nota_resumen === 'string') out.nota_resumen = body.nota_resumen.slice(0, 1500);
  // Interior del libro (migración 005): lista completa de notas, JSONB
  if (Array.isArray(body.notas)) out.notas = require('./estanteria-routes').limpiarNotas(body.notas);
  // Categorías (migración 006): TEXT[]; aquí sí se pasa el arreglo directo
  if (Array.isArray(body.categorias)) out.categorias = require('./estanteria-routes').limpiarCategorias(body.categorias);
  return out;
}
```

`limpiarNotas` devuelve un texto JSON listo para la columna JSONB. No le pases el
arreglo directo a `pg`, porque lo convertiría en un arreglo de Postgres. Al agregar o
borrar una nota, la estantería envía la lista completa: `{ "notas": [...] }`.

El editor de la estantería guarda con un **PUT parcial**: solo envía los campos que
cambiaron (p. ej. `{ "estado_lectura": "leido" }`). Si tu PUT actual reescribe todas
las columnas, cámbialo para actualizar solo las claves presentes:

```js
app.put('/api/libros/:id', auth, async (req, res) => {
  const cambios = { ...limpiarEstante(req.body), ...limpiarColeccion(req.body) };
  // + los campos de siempre (titulo, autor, ...) si vienen en el body
  const keys = Object.keys(cambios);
  if (!keys.length) return res.status(400).json({ error: 'Sin cambios' });
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const vals = keys.map((k) => cambios[k]);
  const dueño = req.user.rol === 'admin' ? '' : ` AND usuario_id = $${keys.length + 2}`;
  const params = req.user.rol === 'admin' ? [...vals, req.params.id] : [...vals, req.params.id, req.user.id];
  const { rows } = await pool.query(
    `UPDATE libros SET ${sets} WHERE id = $${keys.length + 1}${dueño} RETURNING *`, params);
  if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});
```

El rol `lector` no puede editar: el middleware que ya tienes debe responder 403 y la
estantería mostrará "No se pudo guardar".

Resumen para el perfil (opcional):

```sql
SELECT formato, estado_lectura, COUNT(*) FROM libros
WHERE usuario_id = $1 GROUP BY formato, estado_lectura;
```

## 3. Ordenar el GET para el estante

```sql
SELECT * FROM libros
WHERE usuario_id = $1
ORDER BY orden_estante NULLS LAST, fecha;
```

## 4. Servir las portadas desde el mismo dominio

Para que el lomo pueda tomar su color de la portada, la imagen debe venir del mismo
origen (o con cabecera CORS). Lo más simple: guardar las portadas en un volumen y
servirlas por Nginx:

```nginx
location /portadas/ {
  alias /usr/share/nginx/portadas/;
  expires 30d;
}
location /estanteria/ {
  alias /usr/share/nginx/estanteria/;
  try_files $uri $uri/ /estanteria/index.html;
}
```

y en `docker-compose.yml`, en el servicio nginx:

```yaml
volumes:
  - ./frontend:/usr/share/nginx/html:ro
  - ./estanteria/dist:/usr/share/nginx/estanteria:ro
  - ./portadas:/usr/share/nginx/portadas:ro
```

Si una portada viene de otro sitio sin CORS, la estantería no se rompe: usa un color
derivado del título (o `color_lomo` si lo pusiste).
