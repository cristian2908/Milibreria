# Mi Biblioteca · Estantería 3D (Fase 1)

> **Estado del repositorio (nov 2026):** por ahora contiene el módulo **Estantería 3D**
> (`estanteria/`), las rutas nuevas de la API (`api/estanteria-routes.js`) y sus
> migraciones (`api/migrations/`). El resto de Mi Biblioteca que corre en el servidor
> (API original `api/index.js`, frontend actual, `docker-compose`) todavía no está aquí.
>
> Secretos: la configuración va en un `.env` que **no** se sube (ver `.env.example`).

Actualización de Mi Biblioteca: una estantería interactiva donde cada libro sale del
estante, gira hacia ti, muestra portada y contraportada y vuelve a su sitio.
Fase 1 = animación y calidad visual. Sin Ruby ni código del repo de referencia:
componentes React reutilizables (ver `NOTICE.md`).

## Qué hay

```
estanteria/                 Frontend React + Vite
  src/bookshelf/            ← componentes reutilizables
    Bookshelf.jsx           estante: layout, selección única, centrado, Esc para cerrar
    Book3D.jsx              libro de 5 caras + máquina de estados de la animación
    geometry.js             alto por relación de aspecto, grosor no lineal por páginas
    color.js                color del lomo desde la portada + texto legible (WCAG)
    useCoverInfo.js         carga portadas, lee proporción y color
    status.js               formatos y estados de lectura (etiquetas y colores)
  src/i18n.jsx              idiomas (es/en): textos y nombres de categorías
  src/prefs.jsx             apariencia: fondo oscuro/claro y fuente clásica/editorial
  src/components/FloatMenu.jsx      barra y paneles flotantes (genéricos)
  src/components/FloatControls.jsx  contenido del menú flotante: filtros, categorías, orden, menú
  src/search.js             categorías base, búsqueda sin tildes, filtros y orden
  src/store/cloud.js        prototipo en la nube: base de datos + fotos del artifact
  src/components/CategoryPicker.jsx  asignar y crear categorías
    bookshelf.css
  src/api/libros.js         adaptador fila PostgreSQL ↔ libro, crear/editar/eliminar
  src/components/AddBookSheet.jsx  hoja "Agregar libro" (manual y con fotos)
  src/scan/                 recorte/reducción de fotos, instrucción y lectura con IA
  src/data/                 libros y portadas de demostración
api/
  migrations/002_estanteria.sql   portada, páginas, descripción, color de lomo
  migrations/003_coleccion.sql    formato, estado de lectura, nota de resumen
  migrations/004_agregar_con_fotos.sql  contraportada, ISBN, editorial
  migrations/005_notas.sql        lista de notas (JSONB) para el interior
  migrations/006_categorias.sql   categorías TEXT[] (+ migra `genero`), índice GIN
  estanteria-routes.js            subir fotos, leerlas con Claude, crear libro
  CAMBIOS-index.md                qué tocar en api/index.js y Nginx
docs/CLAUDE-estanteria.md   bloque para añadir a tu CLAUDE.md
```

## Menú flotante

Una barra oscura en forma de píldora flota abajo al centro, con cinco botones:

| Icono | Qué hace |
|---|---|
| Lupa | Sube al buscador y lo enfoca |
| Deslizadores | **Filtros**: buscar en, formato y lectura (con conteos) |
| Etiqueta | **Categorías**: varias a la vez, con conteo y **Listo** |
| Flechas | **Orden**: estante, título, autor, páginas, leyendo primero |
| ☰ | **Menú**: fondo claro (interruptor), fuente, idioma y agregar libro |

Cada botón abre un panel flotante redondeado sobre la barra, con un piquito que
señala el botón. Un punto rojo marca los grupos con filtros activos; Categorías
muestra cuántas hay elegidas. Los filtros activos aparecen también bajo el buscador
como fichas con ×. Los paneles se cierran con Esc, tocando fuera o con la ×.

## Apariencia: fondo, fuente e idioma

En **☰ Menú**:

- **Fondo claro**: oscuro (por defecto) o claro. Cambia fondo, tarjetas, la pared y
  la madera del estante; las caras de los libros conservan sus colores. La barra y los
  paneles flotantes son oscuros en ambos temas.
- **Fuente**: **Clásica** (Fraunces + IBM Plex Sans) o **Editorial**
  (Libre Baskerville + Source Sans 3).
- **Idioma**: Español / English.

Las tres preferencias se guardan en este navegador (`mi-biblioteca.tema`,
`mi-biblioteca.fuente`, `mi-biblioteca.idioma`). Un script en `index.html` aplica tema
y fuente antes de pintar para que no haya destello. Los colores salen de variables CSS
en `src/app.css` (`:root` = oscuro, `[data-theme="claro"]` = claro, `--fl-*` = menú
flotante) y las fuentes de `--bs-serif / --bs-sans / --bs-cond` (`[data-font="editorial"]`).

## Idioma (Español / English)

Cambia toda la interfaz, incluidos el texto del libro en 3D (Resumen/Summary,
Notas/Notes, págs./pp.) y las etiquetas de accesibilidad. La primera vez se elige
según el idioma del dispositivo.

- Textos: `src/i18n.jsx` (diccionarios `es` y `en`, `useI18n()` → `t(clave, vars)`).
  Para agregar un idioma, copia el bloque `en`, tradúcelo y añádelo a `LANGS` y `DICTS`.
- Las **categorías de base** se guardan en español y se muestran traducidas
  (Diseño → Design…). El buscador las encuentra con cualquiera de los dos nombres.
  Las categorías que tú crees se muestran tal como las escribiste.
- La lectura por fotos escribe la **descripción en el idioma elegido**.
- Tus datos (títulos, resúmenes, notas) no se traducen.

## Prototipo funcional en la nube (artifact de Claude)

La versión publicada guarda todo en la base de datos del artifact y las fotos en su
almacén de imágenes. Se sincroniza entre el celular y el computador.

- `src/store/cloud.js`: un documento por libro en `libros/<id>`. Las fotos se suben
  con `assets.upload()` y en el documento queda solo su id (`coverAsset`,
  `backAsset`), que se sirve en `/_blob/<id>`. Los libros de ejemplo guardan la
  receta de su portada (`coverSpec`), no la imagen.
- Reglas: cualquiera con acceso al enlace **lee**; solo el dueño y los Editores
  **escriben** (`{ path: "", read: "view", write: "admin" }`). Los demás ven la
  estantería en solo lectura: buscan, filtran y abren libros, pero no editan.
- Escrituras: una a la vez por libro, juntando cambios seguidos. Los cambios aún
  no confirmados se muestran de inmediato, sin saltos en la nota mientras escribes.
- Estantería vacía: "Agregar mi primer libro" o "Cargar 10 libros de ejemplo".
  Luego, "Quitar ejemplos" los borra todos de una vez.
- Libros agregados antes en la vista previa (guardados en el navegador): aparece
  "Subir a la nube".
- Si la base no responde en 10 s, se avisa que los datos pueden estar
  desactualizados. Sin acceso a la base, la página funciona en modo local, en
  este navegador.
- Abierta fuera de Claude (`npm run dev`), la app usa el modo local o la API
  (`VITE_SOURCE=api`).

## Categorías y búsqueda

- **Categorías:** cada libro puede tener varias. Hay nueve de base (Diseño, UX e
  interacción, Tipografía y retícula, Color, Sostenibilidad, Biomimética, Arte y
  cultura visual, Materiales y procesos, Referencia). Se crean nuevas con "＋ Nueva"
  en el panel del libro o al agregarlo. Al leer las fotos, Claude sugiere de 1 a 3
  categorías entre las existentes, y las sugerencias quedan marcadas con borde
  punteado.
- **Buscador:** encuentra por título, autor, categoría, editorial, ISBN, descripción,
  resumen y notas. No distingue tildes ni mayúsculas ("diseno" encuentra "Diseño").
  Si escribes varias palabras, deben aparecer todas. Con "En:" se limita a Título,
  Autor, Categoría o Notas.
- **Resultados:** debajo del buscador aparece la lista de coincidencias con el
  fragmento donde se encontró, por ejemplo "Nota p. 38: …golfo de ejecución…". Al
  tocar una, el estante va al libro y lo saca.
- **Filtros combinables:** categorías (si eliges varias, deben estar todas) + formato
  + estado de lectura. Orden: estante, título, autor, más páginas o leyendo primero.
  "Limpiar" quita todo.
- Las categorías del libro aparecen en el panel (al tocarlas se filtra por esa
  categoría) y en la página de Resumen del interior.

## Interior del libro

Tercera vista: **Portada → Interior → Contraportada**. La portada gira sobre su
bisagra (el lomo) hasta abrirse por completo y el libro se centra como doble
página, con el zoom ajustado para que quepa en el ancho de la pantalla.

- **Página izquierda (cara interna de la portada): Resumen.** Es tu resumen
  (`nota_resumen`). Si no hay, se muestra la descripción. Abajo van el formato y el
  estado de lectura.
- **Página derecha (primera hoja): Notas.** Es la lista de notas, cada una con página
  opcional ("p. 38"), sobre papel rayado.

Las notas se agregan y se borran desde el panel, en la línea "Pág. + texto + Añadir".
El panel tiene botones Estante / Portada / Interior / Contraportada para ir directo a
cualquier vista. El libro arma la ruta física solo: por ejemplo, para ir de la
contraportada al interior gira primero a la portada y después la abre.

## Agregar libros

Botón **Agregar** en el encabezado → hoja con dos pestañas:

- **Con fotos:** foto de la portada (obligatoria) y de la contraportada (opcional),
  con la cámara del celular. "Leer datos de las fotos" usa Claude para llenar título,
  autor, editorial, ISBN, páginas (si están impresas) y un resumen de la
  contraportada. También detecta el borde del libro y recorta la foto, y ese
  recorte se puede desactivar. Todo queda editable antes de guardar.
- **Manual:** formulario con los mismos campos; portada y contraportada opcionales
  desde la galería.

Al guardar, el libro entra al final del estante, el estante se desliza hasta él y lo
saca para mostrar la portada. La portada define el alto y el color del lomo, y las
páginas definen el grosor. Si hay foto de contraportada, aparece de fondo en la cara
trasera del libro, detrás de tu nota. Los libros agregados se pueden eliminar desde
el panel.

- Vista previa (artifact): la lectura usa Claude dentro de la página y los libros
  se guardan en el navegador (`localStorage`, unos 40 KB por foto).
- Servidor: `api/estanteria-routes.js` + migración 004 (ver `api/CAMBIOS-index.md`).

## Colección: físico/virtual, lectura y nota

Cada libro tiene:
- **Formato:** `fisico` | `virtual`. En el lomo aparece un ícono de libro o de
  tableta, y los virtuales tienen el canto gris azulado en lugar de papel.
- **Lectura:** `pendiente` (círculo vacío) | `leyendo` (medio lleno, ámbar) |
  `leido` (verde con ✓).
- **Nota de resumen o referencia:** aparece en la contraportada como "Mi nota".
  Si está vacía, se muestra la descripción del libro.

Arriba están los conteos y la barra de avance de lectura. Se puede filtrar por
formato y por estado, y los filtros se combinan. Con un libro abierto, el panel de
abajo permite cambiar el formato, el estado y la nota. La nota se guarda sola unos
0,7 s después de dejar de escribir.

- Modo demo: los cambios se guardan en `localStorage` (solo ese navegador).
- Modo API: `PUT /api/libros/:id` parcial (ver `api/CAMBIOS-index.md`).

## Secuencia de la animación

`en estante` → `hover` (asoma 18 px) → `afuera` (sale recto del estante) →
`portada` (se desplaza al centro de la pantalla y gira 90°) → `interior` (la portada
se abre 180° sobre el lomo) → `contraportada` (cierra y gira 180°) → `afuera` →
`en estante`.

- Un solo libro abierto a la vez. Si tocas otro, el abierto revierte su animación
  completa mientras el nuevo sale.
- Las transiciones se pueden interrumpir en cualquier punto.
- Teclado: Tab para recorrer lomos, Enter/Espacio para avanzar, Esc para cerrar.
- Respeta `prefers-reduced-motion`.

## Fórmulas

- Alto = ancho de portada ÷ (ancho/alto de la imagen), limitado entre 0.5 y 1.1.
- Grosor = 0.85 · (ancho/200) · páginas^0.6, entre 8 px y 42 % del ancho.
  150 págs. ≈ 13 px · 300 ≈ 20 px · 600 ≈ 30 px (con portada de 150 px).
- Lomo: promedio del 8 % izquierdo de la portada; texto claro u oscuro según el
  mayor contraste WCAG. Prioridad: `color_lomo` manual → portada → hash del título.

## Correr

```bash
cd estanteria
npm install
npm run dev          # http://localhost:5173 (proxy /api → :3001)
npm run build        # dist/ para Nginx en /estanteria/
npm run build:demo   # dist-demo/index.html autocontenido
```

Con datos reales: `VITE_SOURCE=api npm run build` (lee `/api/libros` con el token
guardado en `localStorage.token`). Antes aplica las migraciones 002 a 006.

## Uso del componente

```jsx
import { Bookshelf } from './bookshelf';
<Bookshelf books={libros.map(fromLibro)} onSelectionChange={({ book, face }) => {}} />
```

## Siguiente fase (no incluida)

Orden manual por arrastre, una repisa por categoría, búsqueda por ISBN en
un catálogo abierto para completar páginas, y recorte manual de fotos.
