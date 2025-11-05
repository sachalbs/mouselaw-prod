# 🏥 Diagnostic MouseLaw - 2025-11-04

## 📋 Vue d'ensemble

MouseLaw est un assistant juridique IA pour étudiants en droit utilisant Next.js 15, Supabase (PostgreSQL + pgvector), et Mistral AI pour un système RAG (Retrieval-Augmented Generation).

---

## ✅ Ce qui fonctionne

### Architecture & Stack Technique
- ✅ **Next.js 16.0.0** avec React 19.2.0 et TypeScript 5
- ✅ **Supabase** : Client correctement configuré (`@supabase/supabase-js` v2.77.0)
- ✅ **Configuration environnement** : Variables d'environnement bien structurées
- ✅ **Arborescence propre** : Séparation claire app/components/lib/scripts
- ✅ **Scripts d'import** : 45+ scripts TypeScript pour import de données
- ✅ **Embeddings Mistral** : Génération d'embeddings 1024 dimensions
- ✅ **Méthodologies pédagogiques** : Système complet intégré (table + RAG)
- ✅ **Gitignore data/** : Dossier data/ correctement exclu du versioning

### Base de Données
- ✅ **Extension pgvector** activée
- ✅ **Table `legal_codes`** : Référentiel de 6 codes juridiques
- ✅ **Table `legal_articles`** : Articles avec embeddings vectoriels (index IVFFlat)
- ✅ **Table `methodology_resources`** : Méthodologies pédagogiques avec RAG
- ✅ **Migrations SQL** : 8 migrations structurées

### Système RAG (Articles)
- ✅ **Recherche hybride** : Exact match + similarité vectorielle
- ✅ **Extraction automatique** : Détecte "Article 1240" dans la requête
- ✅ **Calcul similarité cosinus** : Implémenté manuellement
- ✅ **Logs de debug** : Traçabilité complète des recherches

---

## ❌ Problèmes identifiés

### 🔴 CRITIQUE : Jurisprudence JAMAIS retournée par le RAG

**Symptôme** : Les requêtes utilisateur ne retournent que des articles du Code Civil, jamais de jurisprudence, alors que 2,017 décisions sont censées être importées.

**Cause racine** : **INCOHÉRENCE DE NOMMAGE DES TABLES**

#### Preuve du problème

**Migration SQL** (`add_jurisprudence_table.sql`) :
```sql
CREATE TABLE IF NOT EXISTS public.jurisprudence (
  id UUID PRIMARY KEY,
  juridiction TEXT NOT NULL,
  date DATE NOT NULL,
  ...
  embedding VECTOR(1024)
);
```

**Code RAG** (`lib/rag.ts:338`) :
```typescript
const { data, error } = await supabaseServer
  .from('case_law')  // ❌ CHERCHE DANS 'case_law'
  .select(`
    id, title, decision_date, summary, full_text, embedding,
    jurisdictions!inner (name)  // ❌ CHERCHE 'jurisdictions'
  `)
```

**Script d'import** (`scripts/import-cass-xml.ts:432`) :
```typescript
const { data, error } = await supabase
  .from('case_law')  // ❌ INSÈRE DANS 'case_law'
  .insert(records)
```

**Comptage statistiques** (`lib/rag.ts:878`) :
```typescript
const { count: jurisprudenceCount } = await supabaseServer
  .from('case_law')  // ❌ COMPTE DANS 'case_law'
```

#### Tables attendues vs tables existantes

| Table attendue par le code | Table créée par migration | Statut |
|----------------------------|---------------------------|---------|
| `case_law` | `jurisprudence` | ❌ Mismatch |
| `jurisdictions` | N/A | ❌ Manquante |

**Résultat** :
- Les 2,017 décisions sont probablement dans `jurisprudence` (si importées)
- Le RAG cherche dans `case_law` qui n'existe pas
- Toutes les requêtes retournent 0 jurisprudence

---

### 🟡 MOYEN : Déploiement - Fichiers volumineux

**Fichiers data/ volumineux** :
```
data/cass-full.tar.gz         248 MB   ⚠️  Fichier ÉNORME
data/ (total)                 1.7 GB   ⚠️  Dossier complet
```

**Impact** :
- ✅ **GIT OK** : `data/` est dans `.gitignore` (lignes 42-43)
- ⚠️ **Déploiement** : Fichiers doivent être téléchargés séparément en production
- ⚠️ **CI/CD** : Build pourrait échouer si scripts essaient d'accéder à data/

---

### 🟡 MOYEN : Configuration Mistral manquante

**Observation** :
- ❌ Aucune dépendance `@mistralai/*` dans `package.json`
- ✅ Embeddings générés via fetch direct vers API Mistral
- ⚠️ Pas de SDK officiel utilisé

**Impact** : Fonctionnel mais moins robuste (pas de retry automatique, pas de types).

---

### 🟢 MINEUR : Multiples scripts d'import redondants

**45+ scripts dans `/scripts`** dont beaucoup font des choses similaires :
- `import-jurisprudence.ts`
- `import-jurisprudence-api.ts`
- `import-judilibre.ts`
- `import-datagouv-cass.ts`
- `import-cass-xml.ts`

**Impact** : Confusion sur quel script utiliser, maintenance difficile.

---

## 🔧 Causes probables (par priorité)

### 1. Migration `case_law` + `jurisdictions` jamais créée

**Hypothèse** : Le schéma de la base a évolué :
1. **Version 1** : Table `jurisprudence` créée (migration existante)
2. **Version 2** : Code refactorisé pour utiliser `case_law` + `jurisdictions`
3. **❌ Oubli** : Migration pour créer les nouvelles tables jamais écrite

**Preuves** :
```bash
$ grep -r "CREATE TABLE.*case_law" supabase/migrations/
# Aucun résultat

$ grep -r "CREATE TABLE.*jurisdictions" supabase/migrations/
# Aucun résultat
```

---

### 2. Seuil de similarité trop élevé (DÉJÀ CORRIGÉ)

**Avant** : `jurisprudenceThreshold = 0.50` (50%)
**Après** : `jurisprudenceThreshold = 0.40` (40%)

Même avec ce fix, si la table `case_law` n'existe pas, 0 résultat sera retourné.

---

### 3. Données importées dans mauvaise table

**Scénario possible** :
1. Import initial fait dans `jurisprudence` (ancienne table)
2. Code refactorisé pour lire `case_law` (nouvelle table)
3. Données jamais migrées de `jurisprudence` → `case_law`

---

## 💡 Solutions recommandées

### 🎯 SOLUTION 1 (RECOMMANDÉE) : Créer migration `case_law` + `jurisdictions`

**Créer** : `supabase/migrations/create_case_law_tables.sql`

```sql
-- ============================================================================
-- TABLE: jurisdictions
-- Référentiel des juridictions françaises
-- ============================================================================

CREATE TABLE IF NOT EXISTS jurisdictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  type TEXT CHECK (type IN ('cassation', 'appel', 'premiere_instance', 'conseil_etat', 'autre')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jurisdictions_name ON jurisdictions(name);

COMMENT ON TABLE jurisdictions IS 'Référentiel des juridictions françaises';

-- Insérer juridictions principales
INSERT INTO jurisdictions (name, type) VALUES
  ('Cour de cassation', 'cassation'),
  ('Conseil d''État', 'conseil_etat')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- TABLE: case_law
-- Jurisprudence (décisions de justice) avec embeddings
-- ============================================================================

CREATE TABLE IF NOT EXISTS case_law (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  decision_date DATE NOT NULL,
  decision_number TEXT,
  summary TEXT,
  full_text TEXT NOT NULL,
  legal_references TEXT[],
  keywords TEXT[],
  embedding VECTOR(1024),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_decision_number UNIQUE(decision_number)
);

-- Index pour recherches rapides
CREATE INDEX idx_case_law_jurisdiction ON case_law(jurisdiction_id);
CREATE INDEX idx_case_law_date ON case_law(decision_date);
CREATE INDEX idx_case_law_number ON case_law(decision_number);

-- Index vectoriel pour recherche sémantique
CREATE INDEX idx_case_law_embedding ON case_law
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE case_law IS 'Jurisprudence française avec embeddings vectoriels';

-- ============================================================================
-- FONCTION DE RECHERCHE
-- ============================================================================

CREATE OR REPLACE FUNCTION search_case_law(
  query_embedding VECTOR(1024),
  match_threshold FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  jurisdiction_id UUID,
  jurisdiction_name TEXT,
  title TEXT,
  decision_date DATE,
  decision_number TEXT,
  summary TEXT,
  full_text TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.jurisdiction_id,
    j.name AS jurisdiction_name,
    c.title,
    c.decision_date,
    c.decision_number,
    c.summary,
    c.full_text,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM case_law c
  JOIN jurisdictions j ON j.id = c.jurisdiction_id
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger updated_at
CREATE TRIGGER update_jurisdictions_updated_at
  BEFORE UPDATE ON jurisdictions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_case_law_updated_at
  BEFORE UPDATE ON case_law
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Appliquer** :
1. Aller dans **Supabase Dashboard** → **SQL Editor**
2. Copier-coller le SQL ci-dessus
3. Exécuter
4. Vérifier : `SELECT * FROM case_law LIMIT 1;`

---

### 🎯 SOLUTION 2 : Migrer données de `jurisprudence` → `case_law` (si déjà importées)

Si des données existent déjà dans `jurisprudence`, créer un script de migration :

**Créer** : `scripts/migrate-jurisprudence-to-case-law.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrateData() {
  console.log('🔄 Migration jurisprudence → case_law\n');

  // 1. Vérifier si jurisprudence contient des données
  const { count: oldCount } = await supabase
    .from('jurisprudence')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 ${oldCount} décisions trouvées dans 'jurisprudence'\n`);

  if (!oldCount || oldCount === 0) {
    console.log('⚠️  Aucune donnée à migrer');
    return;
  }

  // 2. Créer juridictions depuis jurisprudence
  const { data: jurisprudenceData } = await supabase
    .from('jurisprudence')
    .select('juridiction');

  const uniqueJurisdictions = [...new Set(jurisprudenceData?.map(j => j.juridiction))];

  console.log(`📌 ${uniqueJurisdictions.length} juridictions uniques détectées`);

  for (const name of uniqueJurisdictions) {
    const { error } = await supabase
      .from('jurisdictions')
      .insert([{ name }])
      .select();

    if (error && !error.message.includes('duplicate')) {
      console.error(`❌ Erreur juridiction "${name}":`, error);
    }
  }

  // 3. Migrer décisions par batch
  const BATCH_SIZE = 100;
  let offset = 0;
  let migrated = 0;

  while (true) {
    const { data: decisions } = await supabase
      .from('jurisprudence')
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1);

    if (!decisions || decisions.length === 0) break;

    // Mapper vers case_law
    const caseLawRecords = await Promise.all(
      decisions.map(async (d: any) => {
        // Récupérer jurisdiction_id
        const { data: jurisdiction } = await supabase
          .from('jurisdictions')
          .select('id')
          .eq('name', d.juridiction)
          .single();

        return {
          jurisdiction_id: jurisdiction?.id,
          title: d.titre,
          decision_date: d.date,
          decision_number: d.numero,
          summary: d.solution || d.principe,
          full_text: `${d.faits}\n\n${d.principe}\n\n${d.solution}`,
          legal_references: d.articles_lies || [],
          keywords: d.mots_cles || [],
          embedding: d.embedding,
        };
      })
    );

    // Insérer dans case_law
    const { error } = await supabase
      .from('case_law')
      .insert(caseLawRecords);

    if (error) {
      console.error(`❌ Erreur batch ${offset}:`, error);
    } else {
      migrated += decisions.length;
      console.log(`✅ Migré ${migrated}/${oldCount} décisions`);
    }

    offset += BATCH_SIZE;
  }

  console.log(`\n✅ Migration terminée : ${migrated} décisions migrées`);
}

migrateData().catch(console.error);
```

**Exécuter** :
```bash
npx tsx scripts/migrate-jurisprudence-to-case-law.ts
```

---

### 🎯 SOLUTION 3 : Réimporter jurisprudence directement dans `case_law`

Si aucune donnée dans `jurisprudence`, simplement réimporter :

```bash
# Après avoir appliqué la migration create_case_law_tables.sql
npx tsx scripts/import-cass-xml.ts --limit=2000
```

Le script `import-cass-xml.ts` insère déjà dans `case_law` et `jurisdictions` (lignes 290, 300, 383, 432).

---

### 🎯 SOLUTION 4 (ALTERNATIVE) : Adapter le code pour lire `jurisprudence`

**Si vous préférez garder la table `jurisprudence`**, modifier le code RAG :

**Fichier** : `lib/rag.ts:338`

**AVANT** :
```typescript
const { data, error } = await supabaseServer
  .from('case_law')
  .select(`
    id, title, decision_date, summary, full_text, embedding,
    jurisdictions!inner (name)
  `)
```

**APRÈS** :
```typescript
const { data, error } = await supabaseServer
  .from('jurisprudence')  // ✅ Utiliser la table existante
  .select('*')
```

**Puis adapter le mapping** :
```typescript
return {
  id: caselaw.id,
  juridiction: caselaw.juridiction,  // Champ direct au lieu de join
  date: caselaw.date ? new Date(caselaw.date).toLocaleDateString('fr-FR') : 'Date inconnue',
  numero: caselaw.numero || 'N/A',
  nom_usuel: caselaw.nom_usuel,
  titre: caselaw.titre || 'Sans titre',
  faits: caselaw.faits || '',
  solution: caselaw.solution || 'Non spécifié',
  principe: caselaw.principe || '',
  articles_lies: caselaw.articles_lies || [],
  categorie: caselaw.categorie,
  importance: caselaw.importance,
  mots_cles: caselaw.mots_cles || [],
  similarity: similarity,
  legifrance_id: null,
  legifranceUrl: 'https://www.legifrance.gouv.fr',
};
```

⚠️ **Inconvénient** : Crée une divergence entre le schéma attendu et le code.

---

## 📊 Métriques clés

### Base de données (estimations)
- **legal_codes** : 6 codes juridiques (Code civil, pénal, travail, etc.)
- **legal_articles** : ? articles (requête SQL nécessaire)
- **jurisprudence** : ? décisions (requête SQL nécessaire)
- **case_law** : Probablement 0 (table n'existe pas)
- **methodology_resources** : 17 méthodologies pédagogiques

### Fichiers data/
- **Taille totale** : 1.7 GB
- **Fichiers > 50MB** :
  - `cass-full.tar.gz` : 248 MB (archive jurisprudence DILA)
- **Statut Git** : ✅ Exclu via `.gitignore`

### Dépendances critiques
- **@supabase/supabase-js** : v2.77.0 ✅
- **next** : 16.0.0 ✅
- **react** : 19.2.0 ✅
- **typescript** : 5 ✅
- **dotenv** : 17.2.3 ✅
- **fast-xml-parser** : 5.3.0 ✅ (pour import CASS XML)
- **@mistralai/***  : ❌ Absent (fetch direct utilisé)

---

## 🔍 Requêtes SQL de diagnostic

Pour obtenir les comptages exacts, exécuter dans **Supabase SQL Editor** :

### Comptage par table
```sql
-- Articles du Code Civil
SELECT
  c.full_name,
  COUNT(*) as total,
  COUNT(a.embedding) as with_embedding,
  ROUND(100.0 * COUNT(a.embedding) / COUNT(*), 1) as embedding_pct
FROM legal_codes c
LEFT JOIN legal_articles a ON a.code_id = c.id
GROUP BY c.id, c.full_name
ORDER BY total DESC;

-- Jurisprudence (ancienne table)
SELECT
  COUNT(*) as total,
  COUNT(embedding) as with_embedding,
  COUNT(CASE WHEN embedding IS NULL THEN 1 END) as without_embedding
FROM jurisprudence;

-- Case law (nouvelle table - si elle existe)
SELECT
  COUNT(*) as total,
  COUNT(embedding) as with_embedding
FROM case_law;

-- Méthodologies pédagogiques
SELECT
  category,
  COUNT(*) as total,
  COUNT(embedding) as with_embedding
FROM methodology_resources
GROUP BY category;
```

### Vérification dimension embeddings
```sql
-- Vérifier dimension des vecteurs (doit être 1024)
SELECT
  'legal_articles' as table_name,
  AVG(array_length(embedding::vector, 1)) as avg_dim
FROM legal_articles
WHERE embedding IS NOT NULL

UNION ALL

SELECT
  'jurisprudence' as table_name,
  AVG(array_length(embedding::vector, 1)) as avg_dim
FROM jurisprudence
WHERE embedding IS NOT NULL;
```

### Vérifier si case_law existe
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'case_law'
) as case_law_exists;

SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'jurisdictions'
) as jurisdictions_exists;
```

---

## 🚀 Prochaines étapes (ordre prioritaire)

### 1️⃣ URGENT : Résoudre le problème jurisprudence

**Choix A (RECOMMANDÉ)** : Créer nouvelles tables
```bash
# 1. Appliquer migration create_case_law_tables.sql
# (via Supabase Dashboard)

# 2. Vérifier si données dans jurisprudence
SELECT COUNT(*) FROM jurisprudence;

# 3a. Si données présentes : migrer
npx tsx scripts/migrate-jurisprudence-to-case-law.ts

# 3b. Si aucune donnée : importer directement
npx tsx scripts/import-cass-xml.ts --limit=2000

# 4. Tester le RAG
# Poser question : "Quelle jurisprudence existe sur la responsabilité civile ?"
```

**Choix B (ALTERNATIF)** : Adapter code pour lire `jurisprudence`
```bash
# 1. Modifier lib/rag.ts (voir Solution 4)
# 2. Tester le RAG
```

---

### 2️⃣ MOYEN : Vérifier et documenter l'import

```bash
# Exécuter requêtes SQL de diagnostic ci-dessus
# Documenter dans un fichier DATABASE_STATUS.md :
# - Nombre d'articles par code
# - Nombre de décisions jurisprudence
# - % avec embeddings
```

---

### 3️⃣ MOYEN : Nettoyer scripts d'import redondants

```bash
# Identifier les scripts obsolètes
# Créer un README dans scripts/ documentant :
# - Quel script utiliser pour quoi
# - Scripts à conserver
# - Scripts à archiver
```

---

### 4️⃣ FACULTATIF : Ajouter SDK Mistral officiel

```bash
npm install @mistralai/mistralai

# Puis refactoriser lib/mistral/embeddings.ts
# pour utiliser le SDK au lieu de fetch direct
```

---

### 5️⃣ FACULTATIF : Optimiser déploiement data/

**Option 1** : Utiliser CDN externe
- Uploader `cass-full.tar.gz` sur S3/R2
- Télécharger à la demande en prod

**Option 2** : Script de post-deploy
```bash
# .github/workflows/deploy.yml
- name: Download jurisprudence data
  run: |
    wget https://echanges.dila.gouv.fr/OPENDATA/CASS/Freemium_cass_global_*.tar.gz
    npx tsx scripts/import-cass-xml.ts
```

---

## 📝 Checklist de validation

Une fois les fixes appliqués, vérifier :

- [ ] Tables `case_law` et `jurisdictions` existent
- [ ] Données importées : `SELECT COUNT(*) FROM case_law;` > 0
- [ ] Embeddings présents : `SELECT COUNT(embedding) FROM case_law;` > 0
- [ ] RAG retourne jurisprudence : Poser question test
- [ ] Logs montrent : `Jurisprudence found: X` (X > 0)
- [ ] Prompt contient section "JURISPRUDENCE DISPONIBLE"
- [ ] Réponse Mistral cite au moins 1 décision

---

## 🎓 Résumé Exécutif

**Problème principal** : Incohérence de nommage entre tables SQL et code TypeScript empêche le RAG de retourner la jurisprudence.

**Cause** : Tables `case_law` + `jurisdictions` n'existent pas, mais le code cherche dedans.

**Solution recommandée** : Appliquer migration SQL pour créer les tables manquantes, puis importer/migrer les données.

**Impact** : Une fois corrigé, MouseLaw pourra fournir des réponses enrichies avec jurisprudence + articles + méthodologies.

**Temps estimé de résolution** : 30-60 minutes

---

**Rapport généré le** : 2025-11-04
**Version de diagnostic** : 1.0
**Contact** : Support MouseLaw
