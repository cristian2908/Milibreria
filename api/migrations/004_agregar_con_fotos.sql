-- Mi Biblioteca · Agregar libros manualmente o con fotos
-- Aplicar después de 003_coleccion.sql:
--   cat api/migrations/004_agregar_con_fotos.sql | docker compose exec -T db psql -U libros_user -d libros_db

ALTER TABLE libros ADD COLUMN IF NOT EXISTS contraportada_url TEXT DEFAULT '';  -- foto de la contraportada
ALTER TABLE libros ADD COLUMN IF NOT EXISTS isbn              TEXT;             -- leído de la contraportada
ALTER TABLE libros ADD COLUMN IF NOT EXISTS editorial         TEXT;

CREATE INDEX IF NOT EXISTS libros_isbn_idx ON libros (usuario_id, isbn) WHERE isbn IS NOT NULL;
