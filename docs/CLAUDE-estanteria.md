## 📚 Estantería 3D — Fase 1 (nov 2026)

Nueva vista en React (`/estanteria/`) que convive con el frontend vanilla actual.

- Código: `estanteria/src/bookshelf/` (Bookshelf, Book3D, geometry, color, useCoverInfo).
- Datos: `GET /api/libros` → `fromLibro()` en `estanteria/src/api/libros.js`.
- BD: columnas nuevas en `libros` → `portada_url, paginas, descripcion, color_lomo,
  portada_ratio, orden_estante` (migración `api/migrations/002_estanteria.sql`).
- Portadas servidas por Nginx en `/portadas/` (mismo dominio, evita bloqueo CORS al leer color).
- Referencia de comportamiento: mawise/bookshelf (MIT). No se usa Ruby/Sinatra/ERB/RMagick
  ni su código; ver NOTICE.md. Si se copia código, mantener su atribución MIT.

Reglas de la animación (no romper):
1. Estados: rest → out → front → inside → back → out → rest. Un libro abierto a la vez.
   `routeTo()` en Book3D arma la ruta física entre dos vistas (cerrar portada antes de girar).
2. Al seleccionar otro libro, el abierto revierte toda la secuencia.
3. Alto por relación de aspecto de la portada; grosor = 0.85·(W/200)·páginas^0.6.
4. Color de lomo desde la portada; texto claro/oscuro por contraste WCAG.
5. Covers como background-image (con <img> Chrome dibujaba franjas de libros vecinos
   encima de la portada en 3D).

Colección (migración 003): `formato` (fisico|virtual), `estado_lectura`
(pendiente|leyendo|leido), `nota_resumen`, `leido_en`. Se editan desde el panel de la
estantería con PUT parcial; `nota` original (comentario de recomendación) se conserva.
Lomo: ícono de formato + indicador de lectura; canto gris azul = virtual.
Contraportada: muestra `nota_resumen` como "Mi nota" (si no hay, la descripción).

Agregar libros: `estanteria/src/components/AddBookSheet.jsx` (pestañas Con fotos / Manual).
Fotos → `scan/analyze.js`: en artifact usa la capacidad `sample` con imágenes; en el servidor
`POST /api/libros/analizar` (api/estanteria-routes.js, Anthropic con ANTHROPIC_API_KEY).
El modelo devuelve JSON con datos + `recorte_portada/contraportada` (0–1) para recortar.
Imágenes: `POST /api/portadas` → archivo en volumen `./portadas`, servido por Nginx.
Montar estanteria-routes ANTES de `app.use(express.json())` (límite 10 MB propio).
Migración 004: `contraportada_url, isbn, editorial`.

Interior (migración 005): portada en `.bs-hinge-group` (transform-origin izquierda,
rotateY -179.5° al abrir; con -172° Chrome desenfoca el texto). Cara interna = Resumen
(`nota_resumen` o descripción), primera página = `notas` JSONB [{id,text,page,date}].
`openZ` se calcula para que la doble página (2 × ancho) quepa en el 94 % del ancho visible.

Categorías y búsqueda (migración 006): `categorias TEXT[]` (varias por libro; `genero`
antiguo se migra). `src/search.js`: `fold()` quita tildes; `matchBook()` exige todas las
palabras y devuelve dónde coincidió; `applyFilters()` combina búsqueda + ámbito (todo/título/
autor/categoría/notas) + categorías (AND) + formato + estado + orden. La lectura por foto
recibe las categorías existentes y sugiere 1–3 (`categorias` en el JSON).

Prototipo en la nube (artifact de Claude): modos de datos en App = connecting | cloud | api | local.
cloud → `store/cloud.js` (db `libros/<id>`, assets para fotos, reglas write: admin, lectores solo leen).
Ejemplos: `libros/demo-N` con `demo: true` y `coverSpec`.

Idioma: `src/i18n.jsx` (LangProvider en main.jsx, `useI18n()` → { t, lang, cat }). Ningún texto de
interfaz va escrito directo en los componentes: usar `t('clave')`. Categorías base guardadas en
español, mostradas con `cat()`. La lectura por foto recibe `lang` / `idioma` para la descripción.

Apariencia: `src/prefs.jsx` (PrefsProvider, `usePrefs()` → { theme: 'oscuro'|'claro', font: 'clasica'|'editorial' }),
aplicado como `data-theme` / `data-font` en <html>. Nunca escribir colores fijos en app.css: usar las
variables (--surface, --line, --field, --panel, --accent-text, --on-ink, --ok, --danger…), definidas
para ambos temas. Filtros y ajustes van en el menú flotante: `components/FloatMenu.jsx` (FloatBar, FloatItem,
FloatChips, FloatSection, FloatFoot; un panel a la vez, Esc/fuera para cerrar) y `components/FloatControls.jsx`
(contenido). Tokens propios `--fl-*`: la barra y los paneles son oscuros en ambos temas.

Pendiente fase 2: arrastrar para ordenar, recorte manual, completar páginas por ISBN, varias repisas.


Agregar con fotos: `src/scan/cvcrop.js` (OpenCV.js: detectBookQuad / detectBook con consenso a 3 escalas /
warpQuad; carga perezosa con loadOpenCVFrom(OPENCV_URLS)), `src/scan/completar.js` (ISBN con dígito de control,
páginas desde `texto_visible`; copia CJS en api/estanteria-routes.js). La API lee con OpenRouter (modelos :free) o
Claude según `IA_PROVEEDOR`; `GET /api/libros/analizar/estado` informa el proveedor. El prompt vive en
`src/scan/prompt.js` y su copia en la API: mantener iguales.

Lectura local: `src/scan/local.js` (Tesseract.js 7 + BarcodeDetector/ZXing) y `src/scan/reglas.js` (funciones puras:
camposDesdeOCR, camposPortada, resumenContra, esNombre…). Archivos en TESS_BASE (config.js); vite los copia
(copyTesseract). Opción futura documentada: proveedor Ollama en la API.
