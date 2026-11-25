-- Mi Biblioteca · Categorías (varias por libro) y búsqueda
-- Aplicar después de 005:
--   cat api/migrations/006_categorias.sql | docker compose exec -T db psql -U libros_user -d libros_db

ALTER TABLE libros ADD COLUMN IF NOT EXISTS categorias TEXT[] NOT NULL DEFAULT '{}';

-- Pasar el `genero` antiguo ("Diseño, UX") a categorías, solo donde aún no hay
UPDATE libros
SET categorias = ARRAY(
  SELECT DISTINCT trim(g) FROM unnest(regexp_split_to_array(genero, '[,;/]')) AS g WHERE trim(g) <> ''
)
WHERE cardinality(categorias) = 0 AND coalesce(genero, '') <> '';

CREATE INDEX IF NOT EXISTS libros_categorias_idx ON libros USING GIN (categorias);

-- Búsqueda sin tildes en el servidor (opcional; la estantería ya filtra en el navegador)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
  RAISE NOTICE 'unaccent no se instaló (permiso o paquete); la búsqueda sin tildes del navegador sigue funcionando';
END $$;
-- Ejemplo:
-- SELECT * FROM libros
-- WHERE usuario_id = $1
--   AND unaccent(lower(titulo || ' ' || autor || ' ' || array_to_string(categorias, ' ')
--       || ' ' || coalesce(nota_resumen, '') || ' ' || notas::text)) LIKE '%' || unaccent(lower($2)) || '%';
-- Libros con TODAS estas categorías:  WHERE categorias @> ARRAY['Diseño','UX e interacción']
