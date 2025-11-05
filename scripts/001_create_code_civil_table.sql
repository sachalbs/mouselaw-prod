-- Script de création/correction de la table code_civil_articles
-- À exécuter dans le SQL Editor de Supabase

-- Supprimer la table si elle existe (ATTENTION : supprime toutes les données)
DROP TABLE IF EXISTS public.code_civil_articles CASCADE;

-- Créer la table avec la structure correcte
CREATE TABLE public.code_civil_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Article identification
  article_number TEXT NOT NULL UNIQUE,
  title TEXT,

  -- Content
  content TEXT NOT NULL,
  category TEXT,
  keywords TEXT[],

  -- Structure du Code civil
  book TEXT,
  chapter TEXT,
  section TEXT,

  -- Légifrance
  legifrance_id TEXT,
  legifrance_url TEXT,

  -- Vector embedding (1024 dimensions pour Mistral Embed)
  embedding vector(1024),

  -- Metadata
  code_name TEXT DEFAULT 'Code civil',
  last_modified DATE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes pour la performance
CREATE INDEX idx_code_civil_article_number ON public.code_civil_articles(article_number);
CREATE INDEX idx_code_civil_category ON public.code_civil_articles(category);
CREATE INDEX idx_code_civil_book ON public.code_civil_articles(book);
CREATE INDEX idx_code_civil_chapter ON public.code_civil_articles(chapter);
CREATE INDEX idx_code_civil_section ON public.code_civil_articles(section);
CREATE INDEX idx_code_civil_legifrance_id ON public.code_civil_articles(legifrance_id);
CREATE INDEX idx_code_civil_keywords ON public.code_civil_articles USING GIN(keywords);
CREATE INDEX idx_code_civil_content_search ON public.code_civil_articles USING GIN(to_tsvector('french', content));

-- Index pour la recherche vectorielle
CREATE INDEX idx_code_civil_embedding ON public.code_civil_articles USING hnsw (embedding vector_cosine_ops);

-- RLS Policies
ALTER TABLE public.code_civil_articles ENABLE ROW LEVEL SECURITY;

-- Tous les utilisateurs authentifiés peuvent lire les articles
CREATE POLICY "Authenticated users can read Code civil articles"
  ON public.code_civil_articles
  FOR SELECT
  TO authenticated
  USING (true);

-- Seul le service role peut modifier
CREATE POLICY "Only service role can modify Code civil articles"
  ON public.code_civil_articles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fonction de recherche vectorielle
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
  book text,
  chapter text,
  section text,
  legifrance_url text,
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
    code_civil_articles.book,
    code_civil_articles.chapter,
    code_civil_articles.section,
    code_civil_articles.legifrance_url,
    1 - (code_civil_articles.embedding <=> query_embedding) AS similarity
  FROM public.code_civil_articles
  WHERE code_civil_articles.embedding IS NOT NULL
    AND 1 - (code_civil_articles.embedding <=> query_embedding) > match_threshold
  ORDER BY code_civil_articles.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Commentaires
COMMENT ON TABLE public.code_civil_articles IS 'Articles du Code civil français avec embeddings vectoriels pour la recherche sémantique';
COMMENT ON COLUMN public.code_civil_articles.embedding IS 'Embedding vectoriel 1024D généré par Mistral Embed';
COMMENT ON COLUMN public.code_civil_articles.article_number IS 'Numéro de l''article (ex: "1240", "1231-1")';
COMMENT ON FUNCTION search_similar_articles IS 'Recherche d''articles similaires par similarité cosinus des embeddings';
