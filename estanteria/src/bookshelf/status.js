// Formato y estado de lectura de cada libro.

export const FORMATS = {
  fisico:  { label: 'Físico',  short: 'Físico' },
  virtual: { label: 'Virtual', short: 'Digital' },
};

export const READ_STATUS = {
  pendiente: { label: 'Pendiente', color: '#c9bfae' },
  leyendo:   { label: 'Leyendo',   color: '#ffc861' },
  leido:     { label: 'Leído',     color: '#7fd99a' },
};

export const normFormat = (v) => (v === 'virtual' || v === 'digital' || v === 'ebook' ? 'virtual' : 'fisico');
export const normStatus = (v) => (v in READ_STATUS ? v : 'pendiente');
