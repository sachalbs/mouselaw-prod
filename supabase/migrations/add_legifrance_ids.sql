-- Ajouter colonne pour ID Légifrance dans les articles du Code civil
ALTER TABLE code_civil_articles
ADD COLUMN IF NOT EXISTS legifrance_id TEXT;

-- Ajouter colonne pour ID Légifrance dans la jurisprudence
ALTER TABLE jurisprudence
ADD COLUMN IF NOT EXISTS legifrance_id TEXT;

-- Index pour recherche rapide par ID Légifrance
CREATE INDEX IF NOT EXISTS idx_code_civil_legifrance_id
ON code_civil_articles(legifrance_id);

CREATE INDEX IF NOT EXISTS idx_jurisprudence_legifrance_id
ON jurisprudence(legifrance_id);

-- Commentaires pour documentation
COMMENT ON COLUMN code_civil_articles.legifrance_id IS 'Identifiant unique Légifrance (format: LEGIARTI000...)';
COMMENT ON COLUMN jurisprudence.legifrance_id IS 'Identifiant unique Légifrance (format: JURI...)';
