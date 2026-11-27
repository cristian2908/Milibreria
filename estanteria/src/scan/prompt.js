// Instrucciones para leer un libro a partir de las fotos de su portada y contraportada.
// La misma instrucción se usa en el servidor (api/estanteria-routes.js).
import { completarDesdeTexto } from './completar.js';

export const SCAN_PROMPT = `Eres el asistente de catalogación de una biblioteca personal.
Recibes la foto de la PORTADA de un libro (imagen 1) y, si existe, la de su CONTRAPORTADA (imagen 2).
Lee lo que está impreso y responde SOLO con un objeto JSON, sin texto adicional, con estas claves:

{
  "titulo": string,                 // título tal como aparece, sin subtítulo si es muy largo
  "subtitulo": string | null,
  "autor": string,                  // autores separados por ", "
  "editorial": string | null,
  "isbn": string | null,            // solo dígitos y X, si se ve (ISBN-13 preferido)
  "paginas": number | null,         // solo si está impreso; no lo inventes
  "idioma": string | null,          // "es", "en", ...
  "descripcion": string,            // resumen (máx. 380 caracteres) del texto de la contraportada, en el idioma indicado abajo; si no hay contraportada, una línea neutra a partir de la portada
  "recorte_portada": {"x": n, "y": n, "w": n, "h": n} | null,        // rectángulo del libro dentro de la imagen 1, valores 0–1 desde la esquina superior izquierda
  "recorte_contraportada": {"x": n, "y": n, "w": n, "h": n} | null,  // igual para la imagen 2
  "categorias": string[],          // 1 a 3 categorías de la lista dada; crea una nueva solo si ninguna sirve
  "confianza": "alta" | "media" | "baja",
  "texto_visible": string           // TODO el texto legible de las fotos, en orden de lectura, sin omitir textos pequeños (ISBN, editorial, colección); máx. 2000 caracteres
}

Reglas: no inventes datos que no se vean; usa null. Si la foto ya está recortada al libro, el recorte es {"x":0,"y":0,"w":1,"h":1}.`;

/** Agrega al prompt las categorías que ya existen en la biblioteca */
export function buildScanPrompt(categories = [], hasBack = false, lang = 'es') {
  return SCAN_PROMPT +
    `\n\nEscribe "descripcion" en ${lang === 'en' ? 'inglés' : 'español'}.` +
    `\n\nCategorías existentes: ${categories.length ? categories.join(' | ') : '(ninguna)'}.` +
    `\nImágenes adjuntas: ${hasBack ? 'portada y contraportada' : 'solo portada'}.`;
}

/** Extrae el JSON aunque el modelo lo envuelva en ```json ... ``` y valida ISBN y páginas. */
export function parseScan(text) {
  return completarDesdeTexto(parseRaw(text));
}
function parseRaw(text) {
  if (text && typeof text === 'object') return text;
  const s = String(text || '');
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Respuesta sin JSON');
  return JSON.parse(s.slice(start, end + 1));
}
