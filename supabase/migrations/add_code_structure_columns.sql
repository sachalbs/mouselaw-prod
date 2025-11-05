-- Ajouter les colonnes de structure du Code civil
-- Ces colonnes permettent d'organiser les articles par livre, chapitre et section

ALTER TABLE code_civil_articles
ADD COLUMN IF NOT EXISTS book TEXT,
ADD COLUMN IF NOT EXISTS chapter TEXT,
ADD COLUMN IF NOT EXISTS section TEXT,
ADD COLUMN IF NOT EXISTS legifrance_url TEXT;

-- Index pour recherche par structure
CREATE INDEX IF NOT EXISTS idx_code_civil_book
ON code_civil_articles(book);

CREATE INDEX IF NOT EXISTS idx_code_civil_chapter
ON code_civil_articles(chapter);

CREATE INDEX IF NOT EXISTS idx_code_civil_section
ON code_civil_articles(section);

-- Commentaires pour documentation
COMMENT ON COLUMN code_civil_articles.book IS 'Livre du Code civil (ex: "Livre Ier - Des personnes")';
COMMENT ON COLUMN code_civil_articles.chapter IS 'Chapitre du Code civil (ex: "Chapitre Ier - De la jouissance et de la privation des droits civils")';
COMMENT ON COLUMN code_civil_articles.section IS 'Section du Code civil (ex: "Section 1 - De la jouissance des droits civils")';
COMMENT ON COLUMN code_civil_articles.legifrance_url IS 'URL directe vers l''article sur Légifrance';
