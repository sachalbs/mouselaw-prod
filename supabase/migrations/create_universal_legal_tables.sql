-- Migration: Création des tables pour le système d'import universel
-- Date: 2025-10-30
-- Description: Tables legal_codes et legal_articles pour tous les codes juridiques français

-- Activer l'extension pgvector si pas déjà fait
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- TABLE: legal_codes
-- Référentiel des codes juridiques français
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_name TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  legifrance_id TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_legal_codes_name ON legal_codes(code_name);
CREATE INDEX IF NOT EXISTS idx_legal_codes_legifrance_id ON legal_codes(legifrance_id);

-- Commentaires
COMMENT ON TABLE legal_codes IS 'Référentiel des codes juridiques français';
COMMENT ON COLUMN legal_codes.code_name IS 'Nom court du code (ex: code_civil)';
COMMENT ON COLUMN legal_codes.full_name IS 'Nom complet (ex: Code Civil)';
COMMENT ON COLUMN legal_codes.legifrance_id IS 'ID Légifrance (LEGITEXT...)';

-- ============================================================================
-- TABLE: legal_articles
-- Articles de tous les codes juridiques avec embeddings
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES legal_codes(id) ON DELETE CASCADE,
  article_number TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  section_path TEXT,
  book TEXT,
  title_section TEXT,
  chapter TEXT,
  legifrance_id TEXT NOT NULL,
  legifrance_url TEXT NOT NULL,
  embedding vector(1024),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Contrainte unique: un article par code
  CONSTRAINT unique_article_per_code UNIQUE(code_id, article_number)
);

-- Index pour recherches rapides
CREATE INDEX IF NOT EXISTS idx_legal_articles_code_id ON legal_articles(code_id);
CREATE INDEX IF NOT EXISTS idx_legal_articles_number ON legal_articles(article_number);
CREATE INDEX IF NOT EXISTS idx_legal_articles_legifrance_id ON legal_articles(legifrance_id);

-- Index vectoriel pour recherche sémantique
CREATE INDEX IF NOT EXISTS idx_legal_articles_embedding ON legal_articles
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Commentaires
COMMENT ON TABLE legal_articles IS 'Articles de tous les codes juridiques français';
COMMENT ON COLUMN legal_articles.code_id IS 'Référence vers legal_codes';
COMMENT ON COLUMN legal_articles.article_number IS 'Numéro d''article (ex: 1, 1234, L1234-1)';
COMMENT ON COLUMN legal_articles.content IS 'Texte complet de l''article';
COMMENT ON COLUMN legal_articles.section_path IS 'Chemin hiérarchique (ex: Livre I > Titre II > Chapitre 3)';
COMMENT ON COLUMN legal_articles.embedding IS 'Embedding Mistral (1024 dimensions)';

-- ============================================================================
-- DONNÉES INITIALES: 6 codes juridiques
-- ============================================================================

INSERT INTO legal_codes (code_name, full_name, legifrance_id, description) VALUES
  ('code_civil', 'Code Civil', 'LEGITEXT000006070721', 'Régit les relations entre personnes privées'),
  ('code_penal', 'Code Pénal', 'LEGITEXT000006070719', 'Définit les infractions et les peines'),
  ('code_travail', 'Code du Travail', 'LEGITEXT000006072050', 'Régit les relations de travail'),
  ('code_commerce', 'Code de Commerce', 'LEGITEXT000005634379', 'Régit les actes de commerce et les commerçants'),
  ('code_procedure_civile', 'Code de Procédure Civile', 'LEGITEXT000006070716', 'Règles de procédure devant les juridictions civiles'),
  ('code_procedure_penale', 'Code de Procédure Pénale', 'LEGITEXT000006071154', 'Règles de procédure pénale')
ON CONFLICT (code_name) DO NOTHING;

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

-- Fonction de recherche hybride (texte exact + similarité vectorielle)
CREATE OR REPLACE FUNCTION search_legal_articles(
  query_text TEXT,
  query_embedding vector(1024),
  match_threshold FLOAT DEFAULT 0.7,
  max_results INT DEFAULT 10,
  filter_code_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  code_id UUID,
  code_name TEXT,
  article_number TEXT,
  title TEXT,
  content TEXT,
  section_path TEXT,
  legifrance_url TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.code_id,
    c.code_name,
    a.article_number,
    a.title,
    a.content,
    a.section_path,
    a.legifrance_url,
    1 - (a.embedding <=> query_embedding) AS similarity
  FROM legal_articles a
  JOIN legal_codes c ON c.id = a.code_id
  WHERE
    (filter_code_id IS NULL OR a.code_id = filter_code_id)
    AND a.embedding IS NOT NULL
    AND (
      -- Recherche texte exact
      a.content ILIKE '%' || query_text || '%'
      OR a.article_number ILIKE '%' || query_text || '%'
      OR a.title ILIKE '%' || query_text || '%'
      -- OU similarité vectorielle
      OR (1 - (a.embedding <=> query_embedding)) >= match_threshold
    )
  ORDER BY similarity DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_legal_codes_updated_at
  BEFORE UPDATE ON legal_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_legal_articles_updated_at
  BEFORE UPDATE ON legal_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VUES UTILES
-- ============================================================================

-- Vue avec statistiques par code
CREATE OR REPLACE VIEW legal_codes_stats AS
SELECT
  c.id,
  c.code_name,
  c.full_name,
  COUNT(a.id) AS total_articles,
  COUNT(a.embedding) AS articles_with_embeddings,
  ROUND(100.0 * COUNT(a.embedding) / NULLIF(COUNT(a.id), 0), 1) AS embedding_percentage
FROM legal_codes c
LEFT JOIN legal_articles a ON a.code_id = c.id
GROUP BY c.id, c.code_name, c.full_name
ORDER BY c.code_name;

COMMENT ON VIEW legal_codes_stats IS 'Statistiques d''import par code juridique';
