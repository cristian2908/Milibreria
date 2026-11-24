import { makeCover } from './demoCovers.js';

// Libros de diseño de ejemplo con la misma forma que devuelve fromLibro().
const RAW = [
  { id: '1', categories: ['Diseño', 'UX e interacción'], notes: [{ id: 'd1-0', text: 'Affordances vs. significantes: el significante es lo que comunica la acción.', page: '12' }, { id: 'd1-1', text: 'Los siete pasos de la acción: golfo de ejecución y de evaluación.', page: '38' }, { id: 'd1-2', text: 'Diseñar para el error: hacer reversibles las acciones.', page: '198' }], format: 'fisico', readStatus: 'leido', note: 'Releer cap. 2 (los siete pasos de la acción) para el taller de UX. Útil para justificar affordances en un proyecto.', title: 'The Design of Everyday Things', author: 'Don Norman', pages: 368, aspect: 0.66, style: 'circles', colors: ['#c8432b', '#f2b33d', '#1f2a44'],
    description: 'Por qué tantos objetos cotidianos confunden a quien los usa: affordances, significantes, mapeos y retroalimentación como base del diseño centrado en las personas.' },
  { id: '2', categories: ['UX e interacción', 'Referencia'], notes: [{ id: 'd2-0', text: 'Primera ley: no me hagas pensar. Cada página debe ser evidente.', page: '11' }, { id: 'd2-1', text: 'Pruebas con 3 usuarios por ronda, una vez al mes.', page: '114' }], format: 'virtual', readStatus: 'leido', note: 'Referencia rápida para pruebas de usabilidad: 3 usuarios por ronda bastan para encontrar lo grave.', title: "Don't Make Me Think", author: 'Steve Krug', pages: 216, aspect: 0.78, style: 'bands', colors: ['#f4efe4', '#d23a2e', '#1d1d1d'], ink: '#1d1d1d',
    description: 'Usabilidad web con sentido común: la gente escanea, no lee. Pruebas de usabilidad baratas y frecuentes por encima de las discusiones eternas.' },
  { id: '3', categories: ['Tipografía y retícula'], notes: [{ id: 'd3-0', text: 'Interlineado entre 120 % y 145 % del cuerpo para texto continuo.', page: '88' }, { id: 'd3-1', text: 'La retícula da libertad, no la quita.', page: '155' }], format: 'fisico', readStatus: 'leyendo', note: 'Voy en la parte de retícula. Tomar ejemplos de jerarquía para el portafolio.', title: 'Thinking with Type', author: 'Ellen Lupton', pages: 224, aspect: 0.72, style: 'slash', colors: ['#111111', '#e8e2d3', '#ff5a36'],
    description: 'Guía de tipografía en tres partes —letra, texto y retícula— con ejemplos históricos y contemporáneos para diseñadores y estudiantes.' },
  { id: '4', categories: ['Tipografía y retícula', 'Referencia'], format: 'fisico', readStatus: 'pendiente', note: '', title: 'Grid Systems', author: 'Josef Müller-Brockmann', pages: 176, aspect: 0.81, style: 'grid', colors: ['#ecebe6', '#111111', '#d6302a'], ink: '#111',
    description: 'El manual clásico de la retícula suiza: cómo una estructura modular ordena texto e imagen con claridad y ritmo.' },
  { id: '5', categories: ['Color', 'Arte y cultura visual'], notes: [{ id: 'd5-0', text: 'Un color se ve distinto según su vecino: contraste simultáneo.', page: '8' }], format: 'virtual', readStatus: 'leyendo', note: 'Ejercicios de contraste simultáneo: probar con muestras de lámina pintada.', title: 'Interaction of Color', author: 'Josef Albers', pages: 160, aspect: 0.7, style: 'squares', colors: ['#24366b', '#e6a33a', '#b8452f'],
    description: 'El color es relativo: ejercicios prácticos que muestran cómo un mismo tono cambia según los colores que lo rodean.' },
  { id: '6', categories: ['Sostenibilidad', 'Materiales y procesos'], notes: [{ id: 'd6-0', text: 'Ciclo biológico: nutrientes que vuelven a la tierra. Ciclo técnico: materiales que vuelven a la industria.', page: '92' }, { id: 'd6-1', text: '“Menos malo” no es lo mismo que “bueno”.', page: '45' }], format: 'fisico', readStatus: 'leido', note: 'Referencia: ciclo biológico vs. ciclo técnico (cap. 4).', title: 'Cradle to Cradle', author: 'McDonough & Braungart', pages: 208, aspect: 0.66, style: 'leaf', colors: ['#20362b', '#9fc28a', '#f0d36a'],
    description: 'Diseñar sin residuos: materiales que vuelven a ciclos biológicos o técnicos en lugar de terminar en el relleno sanitario.' },
  { id: '7', categories: ['Biomimética', 'Sostenibilidad'], format: 'virtual', readStatus: 'pendiente', note: 'Recomendado para un análisis biomimético.', title: 'Biomimicry', author: 'Janine Benyus', pages: 320, aspect: 0.67, style: 'circles', colors: ['#d9cfb4', '#3f6b4f', '#b55a2c'], ink: '#1c2a20',
    description: 'La naturaleza como modelo, medida y mentora: soluciones probadas por millones de años de evolución aplicadas a la innovación.' },
  { id: '8', categories: ['Diseño', 'Referencia'], format: 'fisico', readStatus: 'leyendo', note: '', title: 'Universal Principles of Design', author: 'Lidwell, Holden & Butler', pages: 272, aspect: 0.82, style: 'grid', colors: ['#f0b429', '#1b1b1b', '#ffffff'], ink: '#1b1b1b',
    description: 'Ciento veinticinco principios —de la ley de Fitts a la proporción áurea— explicados en doble página con ejemplos visuales.' },
  { id: '9', categories: ['UX e interacción'], format: 'virtual', readStatus: 'pendiente', note: '', title: 'Designing Interfaces', author: 'Jenifer Tidwell', pages: 600, aspect: 0.76, style: 'bands', colors: ['#0f5c5c', '#f2e8cf', '#e07a5f'],
    description: 'Catálogo de patrones de interacción para navegación, formularios, listas y visualización de datos en web y móvil.' },
  { id: '10', categories: ['Arte y cultura visual'], notes: [{ id: 'd10-0', text: 'Ver llega antes que las palabras.', page: '7' }, { id: 'd10-1', text: 'La publicidad vende la envidia de uno mismo en el futuro.', page: '132' }], format: 'fisico', readStatus: 'leido', note: 'Ensayo 7 sobre publicidad: buena cita para ética del diseño.', title: 'Ways of Seeing', author: 'John Berger', pages: 176, aspect: 0.65, style: 'slash', colors: ['#b3261e', '#f5f0e6', '#111111'],
    description: 'Ensayos sobre cómo miramos las imágenes: arte, publicidad y el contexto que cambia su significado.' },
];

export function buildDemoBooks() {
  return RAW.map(({ style, colors, ink, aspect, ...b }) => ({
    ...b,
    cover: makeCover({ title: b.title, author: b.author, aspect, style, colors, ink }),
  }));
}

// ── Para la base de datos: los ejemplos guardan la receta de su portada, no la imagen ──
export function demoSeedDocs() {
  return RAW.map(({ id, style, colors, ink, aspect, ...b }, i) => ({
    ...b,
    demo: true,
    order: i,
    aspect,
    coverSpec: { style, colors, ink: ink || '#fff', aspect },
    _demoId: id,
  }));
}

const specCache = new Map();
export function coverFromSpec(spec, title, author) {
  const key = `${title}|${author}|${JSON.stringify(spec)}`;
  if (!specCache.has(key)) specCache.set(key, makeCover({ title, author, ...spec }));
  return specCache.get(key);
}
