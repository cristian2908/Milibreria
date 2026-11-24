-- Mi Biblioteca · Formato, estado de lectura y nota de resumen
-- Aplicar después de 002_estanteria.sql:
--   cat api/migrations/003_coleccion.sql | docker compose exec -T db psql -U libros_user -d libros_db

ALTER TABLE libros ADD COLUMN IF NOT EXISTS formato        TEXT DEFAULT 'fisico';     -- fisico | virtual
ALTER TABLE libros ADD COLUMN IF NOT EXISTS estado_lectura TEXT DEFAULT 'pendiente';  -- pendiente | leyendo | leido
ALTER TABLE libros ADD COLUMN IF NOT EXISTS nota_resumen   TEXT DEFAULT '';           -- resumen, cita, capítulo/página de referencia
ALTER TABLE libros ADD COLUMN IF NOT EXISTS leido_en       DATE;                      -- se llena al marcar "leído"

ALTER TABLE libros DROP CONSTRAINT IF EXISTS libros_formato_chk;
ALTER TABLE libros ADD  CONSTRAINT libros_formato_chk CHECK (formato IN ('fisico', 'virtual'));
ALTER TABLE libros DROP CONSTRAINT IF EXISTS libros_estado_lectura_chk;
ALTER TABLE libros ADD  CONSTRAINT libros_estado_lectura_chk CHECK (estado_lectura IN ('pendiente', 'leyendo', 'leido'));

CREATE INDEX IF NOT EXISTS libros_estado_idx ON libros (usuario_id, estado_lectura, formato);

-- Nota: la columna `nota` existente (comentario de la recomendación) no se toca.
-- Si ya la usabas como resumen y quieres moverla, descomenta:
-- UPDATE libros SET nota_resumen = nota WHERE nota_resumen = '' AND nota <> '';
