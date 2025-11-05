-- Create jurisprudence table for case law
CREATE TABLE IF NOT EXISTS public.jurisprudence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  juridiction TEXT NOT NULL,
  date DATE NOT NULL,
  numero TEXT NOT NULL,
  nom_usuel TEXT,
  titre TEXT NOT NULL,
  faits TEXT NOT NULL,
  solution TEXT NOT NULL,
  principe TEXT NOT NULL,
  articles_lies TEXT[] DEFAULT '{}',
  categorie TEXT,
  importance TEXT CHECK (importance IN ('fondamental', 'majeur', 'important', 'complementaire')),
  mots_cles TEXT[] DEFAULT '{}',
  embedding VECTOR(1024),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on juridiction for filtering
CREATE INDEX IF NOT EXISTS idx_jurisprudence_juridiction
ON public.jurisprudence(juridiction);

-- Create index on date for sorting
CREATE INDEX IF NOT EXISTS idx_jurisprudence_date
ON public.jurisprudence(date);

-- Create index on categorie for filtering
CREATE INDEX IF NOT EXISTS idx_jurisprudence_categorie
ON public.jurisprudence(categorie);

-- Create index on importance for filtering
CREATE INDEX IF NOT EXISTS idx_jurisprudence_importance
ON public.jurisprudence(importance);

-- Create index on numero for unique lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_jurisprudence_numero
ON public.jurisprudence(numero);

-- Create vector similarity index for embeddings
CREATE INDEX IF NOT EXISTS idx_jurisprudence_embedding
ON public.jurisprudence
USING hnsw (embedding vector_cosine_ops);

-- Create a function to search for similar jurisprudence based on embedding
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

-- Comment on the table
COMMENT ON TABLE public.jurisprudence IS
'Table contenant la jurisprudence (arrêts de la Cour de cassation) avec embeddings vectoriels pour la recherche sémantique';

-- Comment on the search function
COMMENT ON FUNCTION search_similar_jurisprudence IS
'Recherche les arrêts de jurisprudence similaires basée sur la similarité vectorielle (cosine distance). Supporte le filtrage par catégorie et importance.';

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_jurisprudence_updated_at
BEFORE UPDATE ON public.jurisprudence
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
