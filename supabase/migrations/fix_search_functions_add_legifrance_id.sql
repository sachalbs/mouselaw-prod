-- Update search_similar_articles to return legifrance_id
-- This fixes the issue where Légifrance URLs couldn't be generated

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

-- Update search_similar_jurisprudence to return legifrance_id
CREATE OR REPLACE FUNCTION search_similar_jurisprudence(
  query_embedding VECTOR(1024),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_categorie TEXT DEFAULT NULL,
  filter_importance TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  juridiction TEXT,
  date DATE,
  numero TEXT,
  nom_usuel TEXT,
  titre TEXT,
  faits TEXT,
  solution TEXT,
  principe TEXT,
  articles_lies TEXT[],
  categorie TEXT,
  importance TEXT,
  mots_cles TEXT[],
  legifrance_id TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    jurisprudence.id,
    jurisprudence.juridiction,
    jurisprudence.date,
    jurisprudence.numero,
    jurisprudence.nom_usuel,
    jurisprudence.titre,
    jurisprudence.faits,
    jurisprudence.solution,
    jurisprudence.principe,
    jurisprudence.articles_lies,
    jurisprudence.categorie,
    jurisprudence.importance,
    jurisprudence.mots_cles,
    jurisprudence.legifrance_id,
    1 - (jurisprudence.embedding <=> query_embedding) AS similarity
  FROM public.jurisprudence
  WHERE jurisprudence.embedding IS NOT NULL
    AND 1 - (jurisprudence.embedding <=> query_embedding) > match_threshold
    AND (filter_categorie IS NULL OR jurisprudence.categorie = filter_categorie)
    AND (filter_importance IS NULL OR jurisprudence.importance = filter_importance)
  ORDER BY jurisprudence.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Update comments
COMMENT ON FUNCTION search_similar_articles IS
'Search for similar articles based on vector similarity using cosine distance. Returns articles with similarity above threshold, ordered by relevance. Now includes legifrance_id for direct links.';

COMMENT ON FUNCTION search_similar_jurisprudence IS
'Recherche les arrêts de jurisprudence similaires basée sur la similarité vectorielle (cosine distance). Supporte le filtrage par catégorie et importance. Inclut legifrance_id pour les liens directs.';
