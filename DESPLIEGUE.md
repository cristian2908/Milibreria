# Tarea para Claude Code: desplegar la estantería 3D en el servidor

Eres Claude Code en el servidor Linux de Jurado, dentro de una copia de este repositorio
(`github.com/cristian2908/Milibreria`). Tu trabajo es llevar a su instalación real de
Mi Biblioteca (Docker Compose: API Node/Express, PostgreSQL y Nginx) la versión actual de la
estantería 3D, que incluye:

- **Recorte automático con OpenCV.js** al agregar libros con fotos (corre en el navegador).
- **Lectura de las fotos con un modelo gratuito de OpenRouter** (o Claude de respaldo).
- Validación del ISBN por dígito de control y páginas tomadas del texto leído.

Habla con Jurado en español, en mensajes cortos. Trabaja por pasos y muestra qué vas a
cambiar antes de cambiarlo.

## Reglas

1. **Pide un sí explícito** antes de: editar `api/index.js` de su app, `docker-compose.yml`,
   la configuración de Nginx, o reiniciar contenedores.
2. **Antes de reemplazar un archivo, guarda una copia** con sufijo `.bak-AAAAMMDD-HHMM`
   y anótala para el informe final.
3. **Secretos:** nunca muestres, copies ni pidas que te pegue en el chat el contenido de
   `.env`, claves (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`), `POSTGRES_PASSWORD`, `JWT_SECRET`
   ni tokens. Para comprobar si una variable existe, imprime solo `true` o `false`.
4. **Base de datos:** esta tarea no la modifica. Si faltan las columnas de la estantería
   (paso 3), detente: primero va el paquete `actualizacion-bd` (copia de seguridad,
   migraciones 002–006 e importación de los libros del prototipo).
5. Si algo falla, detente, muestra el error y la causa probable. No reintentes a ciegas.

## Qué hay en este repositorio

| Ruta | Qué es |
|---|---|
| `estanteria/` | App React + Vite. `VITE_SOURCE=api npm run build` → `estanteria/dist/` (incluye `dist/vendor/opencv.js`, 13 MB) |
| `api/estanteria-routes.js` | Rutas: `POST /api/portadas`, `POST /api/libros/analizar`, `GET /api/libros/analizar/estado`, `POST /api/libros` |
| `api/CAMBIOS-index.md` | Cómo montar las rutas en `api/index.js`, volúmenes y Nginx |
| `api/migrations/002–006` | Columnas nuevas de `libros` (las aplica el paquete `actualizacion-bd`) |
| `.env.example` | Variables nuevas (`OPENROUTER_API_KEY`, `OPENROUTER_MODELS`, `IA_PROVEEDOR`…) |

## Pasos

### 1. Ubicar la instalación real

- Busca el `docker-compose.yml` de Mi Biblioteca, por ejemplo con
  `find ~ /opt /srv -maxdepth 3 -name docker-compose.yml 2>/dev/null`. Si hay varios, pregunta.
- Desde esa carpeta, con `docker compose ps` y `docker-compose.yml`, identifica:
  el servicio de la API y su carpeta de código en el host, el servicio de Nginx y su
  configuración, el servicio de PostgreSQL, y dónde se monta la carpeta `portadas`.
- Resume lo encontrado en una tabla corta (servicio → carpeta o archivo) antes de seguir.

### 2. Revisar lo que ya está desplegado

Reporta cada punto con ✓ o ✗:

- `api/index.js` ya hace `require('./estanteria-routes')` y lo monta **antes** de `app.use(express.json())`.
- Nginx tiene `location /estanteria/` y `location /portadas/`.
- `docker-compose.yml` monta `estanteria/dist` en Nginx y `portadas` en la API y en Nginx.
- Versión de Node dentro del contenedor de la API (`docker compose exec <api> node -v`): debe ser 18 o más (usa `fetch` nativo).

### 3. Verificar la base de datos (solo lectura)

```bash
docker compose exec -T <servicio-db> psql -U <usuario> -d <base> -tAc \
  "SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns
   WHERE table_name = 'libros' AND column_name IN ('estado_lectura','formato','categorias','notas','portada_url','contraportada_url','isbn','editorial')"
```

Deben aparecer las 8 columnas. Si falta alguna, aplica la regla 4 y detente.

### 4. Construir la estantería

En la carpeta de este repositorio:

```bash
cd estanteria
npm ci && VITE_SOURCE=api npm run build
```

Si el servidor no tiene Node 20, usa un contenedor de un solo uso:

```bash
docker run --rm -v "$PWD":/app -w /app -e VITE_SOURCE=api node:20 sh -c "npm ci && npm run build"
```

Comprueba que existan `dist/index.html` y `dist/vendor/opencv.js` (unos 13 MB).

### 5. Actualizar la API (pide confirmación)

1. Copia de seguridad del `estanteria-routes.js` actual de la API, si existe.
2. Copia `api/estanteria-routes.js` de este repositorio a la carpeta de la API.
3. Si el paso 2 marcó ✗ en el montaje, muestra el cambio exacto en `api/index.js` según
   `api/CAMBIOS-index.md` (sección 0) y aplícalo solo con un sí.

### 6. Clave de OpenRouter (la escribe Jurado, no tú)

- Comprueba si ya existe, sin mostrarla: `grep -q '^OPENROUTER_API_KEY=.' .env && echo true || echo false`.
- Si no existe, pídele a Jurado que cree una clave gratis en https://openrouter.ai/keys y que
  corra él mismo, en la carpeta del `docker-compose.yml`:

  ```bash
  read -rs -p "Clave de OpenRouter: " K && printf '\nOPENROUTER_API_KEY=%s\nIA_PROVEEDOR=auto\n' "$K" >> .env && unset K
  ```

  (En Claude Code puede correrlo con `!` delante; la clave no se muestra.)
- Revisa que el servicio de la API reciba el `.env` (`env_file: .env` o la variable en
  `environment:`). Si no, propone el cambio en `docker-compose.yml` y espera el sí.

### 7. Nginx (pide confirmación si hay que cambiar algo)

- Si falta `location /estanteria/` o `location /portadas/`, muestra el bloque de
  `api/CAMBIOS-index.md` (sección 4) y aplícalo con un sí. Valida con `nginx -t` dentro del contenedor.
- Recomienda comprimir `opencv.js` (13 MB → 3,8 MB): `gzip on; gzip_types application/javascript text/css;`.
- Verifica también `client_max_body_size 12m;` (las fotos van en base64).

### 8. Publicar y reiniciar (pide confirmación)

1. Si Nginx monta `estanteria/dist` desde otra ruta, guarda una copia del `dist` anterior
   y copia el nuevo ahí.
2. `docker compose restart <api>` y recarga Nginx (`nginx -s reload` en su contenedor).

### 9. Verificar

Reemplaza `<base>` por la URL del servidor (por ejemplo `http://localhost` o el dominio DuckDNS):

```bash
curl -s -o /dev/null -w "estanteria %{http_code}\n" <base>/estanteria/
curl -s -o /dev/null -w "opencv %{http_code} %{size_download} bytes\n" <base>/estanteria/vendor/opencv.js
curl -sI -H 'Accept-Encoding: gzip' <base>/estanteria/vendor/opencv.js | grep -i content-encoding || echo "sin gzip"
curl -s -o /dev/null -w "analizar/estado %{http_code} (401 = ruta montada, 404 = falta montar)\n" <base>/api/libros/analizar/estado
docker compose exec <api> node -e "console.log('OPENROUTER_API_KEY presente:', !!process.env.OPENROUTER_API_KEY)"
```

**Prueba real de lectura (1 de las 50 lecturas gratis del día)**, desde el contenedor de la API,
con una portada que ya esté en la carpeta de portadas (por ejemplo
`natura-bonilla-maldonado-portada.jpg` si se corrió `actualizacion-bd`):

```bash
docker compose exec -T <api> node -e '
const fs = require("fs");
const img = fs.readFileSync(process.argv[1]).toString("base64");
fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + process.env.OPENROUTER_API_KEY },
  body: JSON.stringify({ model: "amazon/nova-2-lite-v1:free", temperature: 0, max_tokens: 300,
    messages: [{ role: "user", content: [
      { type: "text", text: "Escribe el título y el autor de este libro." },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64," + img } } ] }] }),
}).then(async (r) => { const j = await r.json(); console.log(r.status, j.model || "", (j.choices?.[0]?.message?.content || JSON.stringify(j.error || j)).slice(0, 200)); })
  .catch((e) => console.log("error de red:", e.cause?.code || e.message));
' /app/portadas/natura-bonilla-maldonado-portada.jpg
```

(Usa la ruta de `PORTADAS_DIR` dentro del contenedor si no es `/app/portadas`.)

Debe responder 200 con el título y el autor. «error de red» indica que el contenedor no sale a internet. Un 401 indica clave mala; un 429, que se acabó el cupo del día; un 404, que el modelo ya no existe (la API usará `openrouter/free`).

### 10. Informe final

En pocas líneas:

- Qué cambió: archivos, copias de seguridad, configuración y contenedores reiniciados.
- Resultado de cada verificación del paso 9.
- Cómo probar desde el celular: abrir `<base>/estanteria/` con la sesión iniciada en Mi Biblioteca,
  **Agregar → Con fotos**, tomar portada y contraportada, revisar que se recorten y pulsar
  «Leer datos de las fotos».
- Cómo volver atrás: restaurar las copias `.bak-…`, el `dist` anterior, y reiniciar.
