-- Mi Biblioteca · Fase estantería 3D
-- Agrega a `libros` los datos físicos que necesita la estantería.
-- Seguro de ejecutar varias veces (IF NOT EXISTS).
--
-- Aplicar:
--   cat api/migrations/002_estanteria.sql | docker compose exec -T db psql -U libros_user -d libros_db

ALTER TABLE libros ADD COLUMN IF NOT EXISTS portada_url   TEXT    DEFAULT '';   -- /portadas/123.jpg (mismo dominio = sin problemas de CORS)
ALTER TABLE libros ADD COLUMN IF NOT EXISTS paginas       INTEGER;              -- grosor del lomo
ALTER TABLE libros ADD COLUMN IF NOT EXISTS descripcion   TEXT    DEFAULT '';   -- texto de la contraportada
ALTER TABLE libros ADD COLUMN IF NOT EXISTS color_lomo    TEXT    DEFAULT '';   -- opcional: '#2b4a6f' fuerza el color del lomo
ALTER TABLE libros ADD COLUMN IF NOT EXISTS portada_ratio REAL;                 -- opcional: ancho/alto; si es NULL se lee de la imagen
ALTER TABLE libros ADD COLUMN IF NOT EXISTS orden_estante INTEGER;              -- opcional: orden manual en el estante

ALTER TABLE libros DROP CONSTRAINT IF EXISTS libros_paginas_rango;
ALTER TABLE libros ADD  CONSTRAINT libros_paginas_rango CHECK (paginas IS NULL OR paginas BETWEEN 1 AND 5000);

CREATE INDEX IF NOT EXISTS libros_orden_estante_idx ON libros (usuario_id, orden_estante NULLS LAST, fecha);
