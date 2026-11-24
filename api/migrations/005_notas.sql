-- Mi Biblioteca · Interior del libro: lista de notas con página
-- Aplicar después de 004:
--   cat api/migrations/005_notas.sql | docker compose exec -T db psql -U libros_user -d libros_db
--
-- Cada nota: {"id": "n1abc", "text": "...", "page": "38" | null, "date": "2026-11-18"}
-- `nota_resumen` sigue siendo el resumen (página izquierda del interior).

ALTER TABLE libros ADD COLUMN IF NOT EXISTS notas JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE libros DROP CONSTRAINT IF EXISTS libros_notas_es_lista;
ALTER TABLE libros ADD  CONSTRAINT libros_notas_es_lista CHECK (jsonb_typeof(notas) = 'array');

-- Buscar dentro de las notas (opcional): WHERE notas::text ILIKE '%affordance%'
