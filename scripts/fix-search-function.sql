-- =============================================================================
-- FIX: Correction de la fonction search_similar_articles
-- =============================================================================
--
-- Ce script corrige l'erreur "column code_civil_articles.numero does not exist"
-- en recréant la fonction avec les bons noms de colonnes.
--
-- USAGE :
-- 1. Copier tout le contenu de ce fichier
-- 2. Aller dans Supabase Dashboard → SQL Editor
-- 3. Coller et exécuter
--
-- =============================================================================

-- Étape 1 : Supprimer les anciennes versions de la fonction
DROP FUNCTION IF EXISTS search_similar_articles(vector, float, int);
DROP FUNCTION IF EXISTS search_similar_articles(vector(1024), float, int);

-- Étape 2 : Recréer la fonction avec les bons noms de colonnes
CREATE OR REPLACE FUNCTION search_similar_articles(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  article_number text,
  title text,
  content text,
  category text,
  legifrance_id text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    code_civil_articles.id,
    code_civil_articles.article_number,
    code_civil_articles.title,
    code_civil_articles.content,
    code_civil_articles.category,
    code_civil_articles.legifrance_id,
    1 - (code_civil_articles.embedding <=> query_embedding) AS similarity
  FROM public.code_civil_articles
  WHERE code_civil_articles.embedding IS NOT NULL
    AND 1 - (code_civil_articles.embedding <=> query_embedding) > match_threshold
  ORDER BY code_civil_articles.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Étape 3 : Ajouter un commentaire
COMMENT ON FUNCTION search_similar_articles IS
'Search for similar articles based on vector similarity using cosine distance. Returns articles with similarity above threshold, ordered by relevance. Includes legifrance_id for direct links.';

-- Étape 4 : Vérifications
DO $$
DECLARE
  articles_count INT;
  embedded_count INT;
BEGIN
  -- Compter les articles
  SELECT COUNT(*) INTO articles_count FROM code_civil_articles;
  SELECT COUNT(*) INTO embedded_count FROM code_civil_articles WHERE embedding IS NOT NULL;

  RAISE NOTICE '✅ Function search_similar_articles created successfully';
  RAISE NOTICE '📊 Total articles in database: %', articles_count;
  RAISE NOTICE '📊 Articles with embeddings: %', embedded_count;

  IF embedded_count = 0 THEN
    RAISE WARNING '⚠️  No articles have embeddings! Run: npx tsx scripts/import-and-embed.ts';
  ELSIF embedded_count < articles_count THEN
    RAISE WARNING '⚠️  Only % out of % articles have embeddings', embedded_count, articles_count;
  ELSE
    RAISE NOTICE '✅ All articles have embeddings - RAG is ready!';
  END IF;
END $$;
