-- ============================================================================
-- TABLE : methodology_resources
-- Méthodologies et ressources pédagogiques pour étudiants en droit
-- ============================================================================

-- Table pour les méthodologies pédagogiques
CREATE TABLE methodology_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  type TEXT NOT NULL CHECK (type IN ('methodology', 'template', 'tip', 'checklist', 'example')),
  category TEXT NOT NULL CHECK (category IN ('commentaire_arret', 'cas_pratique', 'dissertation', 'fiche_arret', 'note_synthese')),
  subcategory TEXT, -- 'introduction', 'developpement', 'erreurs', 'notation', etc.

  -- Contenu principal
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',

  -- Métadonnées pédagogiques
  level TEXT CHECK (level IN ('L1', 'L2', 'L3', 'M1', 'M2', 'CRFPA', 'Tous')),
  duration_minutes INTEGER, -- durée exercice (180 pour 3h)
  points_notation INTEGER, -- barème total

  -- Liens
  related_legal_concepts TEXT[],
  example_cases TEXT[],

  -- RAG (embeddings vectoriels pour recherche sémantique)
  embedding VECTOR(1024),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEX VECTORIEL pour recherche sémantique RAG
-- ============================================================================

CREATE INDEX idx_methodology_embedding ON methodology_resources
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- INDEX CLASSIQUES pour filtrage et performances
-- ============================================================================

CREATE INDEX idx_methodology_category ON methodology_resources(category);
CREATE INDEX idx_methodology_type ON methodology_resources(type);
CREATE INDEX idx_methodology_level ON methodology_resources(level);
CREATE INDEX idx_methodology_subcategory ON methodology_resources(subcategory);

-- Index GIN pour recherche dans les tableaux
CREATE INDEX idx_methodology_keywords ON methodology_resources USING GIN(keywords);
CREATE INDEX idx_methodology_legal_concepts ON methodology_resources USING GIN(related_legal_concepts);

-- ============================================================================
-- FONCTION DE MISE À JOUR AUTOMATIQUE updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_methodology_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_methodology_updated_at
BEFORE UPDATE ON methodology_resources
FOR EACH ROW
EXECUTE FUNCTION update_methodology_updated_at();

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================

COMMENT ON TABLE methodology_resources IS 'Méthodologies et ressources pédagogiques pour étudiants en droit (commentaires d''arrêt, cas pratiques, dissertations, etc.)';
COMMENT ON COLUMN methodology_resources.type IS 'Type de ressource : methodology, template, tip, checklist, example';
COMMENT ON COLUMN methodology_resources.category IS 'Catégorie d''exercice juridique : commentaire_arret, cas_pratique, dissertation, fiche_arret, note_synthese';
COMMENT ON COLUMN methodology_resources.subcategory IS 'Sous-catégorie optionnelle : introduction, developpement, erreurs, notation, etc.';
COMMENT ON COLUMN methodology_resources.embedding IS 'Vecteur d''embedding (1024 dimensions) pour recherche sémantique RAG via Mistral Embed';
COMMENT ON COLUMN methodology_resources.duration_minutes IS 'Durée recommandée de l''exercice en minutes (ex: 180 pour un commentaire de 3h)';
COMMENT ON COLUMN methodology_resources.points_notation IS 'Barème total de notation (ex: 20 points)';
