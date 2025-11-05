# 🔬 Analyse Détaillée du RAG Jurisprudence

## 🎯 Objectif

Identifier pourquoi le système RAG ne retourne JAMAIS de jurisprudence malgré 2,017 décisions censées être importées.

---

## 📍 Lignes de Code Problématiques

### Fichier : `lib/rag.ts`

#### 🔴 Ligne 338 : Requête sur table inexistante

```typescript
const { data, error } = await supabaseServer
  .from('case_law')  // ❌ PROBLÈME #1: Table n'existe pas
  .select(`
    id,
    title,
    decision_date,
    decision_number,
    summary,
    full_text,
    embedding,
    jurisdictions!inner (  // ❌ PROBLÈME #2: Table n'existe pas + INNER JOIN
      name
    )
  `)
  .not('embedding', 'is', null)
  .limit(500);
```

**Problèmes identifiés** :

1. **Table `case_law` n'existe pas dans Supabase**
   - Aucune migration SQL ne crée cette table
   - Seule la table `jurisprudence` existe (créée par `add_jurisprudence_table.sql`)

2. **Table `jurisdictions` n'existe pas**
   - Aucune migration SQL ne crée cette table
   - Le script `import-cass-xml.ts` essaie d'y insérer mais la table n'existe pas

3. **INNER JOIN bloquant**
   - `jurisdictions!inner` signifie INNER JOIN en syntaxe Supabase
   - Si la table `jurisdictions` n'existe pas ou est vide, **ZÉRO résultat** sera retourné
   - Même si `case_law` contenait des données

---

## 🔍 Schéma des Tables

### Table Créée par Migration

**Fichier** : `supabase/migrations/add_jurisprudence_table.sql`

```sql
CREATE TABLE IF NOT EXISTS public.jurisprudence (
  id UUID PRIMARY KEY,
  juridiction TEXT NOT NULL,        -- ✅ Champ direct (pas de FK)
  date DATE NOT NULL,
  numero TEXT NOT NULL,
  nom_usuel TEXT,
  titre TEXT NOT NULL,
  faits TEXT NOT NULL,
  solution TEXT NOT NULL,
  principe TEXT NOT NULL,
  articles_lies TEXT[],
  categorie TEXT,
  importance TEXT,
  mots_cles TEXT[],
  embedding VECTOR(1024),           -- ✅ Embeddings présents
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Caractéristiques** :
- ✅ Contient directement le nom de la juridiction (pas de relation)
- ✅ Index vectoriel HNSW pour recherche sémantique
- ✅ Tous les champs nécessaires présents

### Tables Attendues par le Code

**Non créées** :

```sql
-- ❌ Table case_law (n'existe pas)
CREATE TABLE case_law (
  id UUID,
  jurisdiction_id UUID,  -- FK vers jurisdictions
  title TEXT,
  decision_date DATE,
  decision_number TEXT,
  summary TEXT,
  full_text TEXT,
  embedding VECTOR(1024)
);

-- ❌ Table jurisdictions (n'existe pas)
CREATE TABLE jurisdictions (
  id UUID,
  name TEXT  -- "Cour de cassation", "Conseil d'État", etc.
);
```

---

## 🔄 Flux de Recherche Actuel

### Étape par Étape

```
Utilisateur pose question
    ↓
searchRelevantSources() appelée (lib/rag.ts:587)
    ↓
searchRelevantJurisprudence() appelée (lib/rag.ts:589)
    ↓
Requête Supabase (lib/rag.ts:338)
    .from('case_law')              ← ❌ Table inexistante
    .select('..., jurisdictions')  ← ❌ Table inexistante
    ↓
ERROR: "relation case_law does not exist"
    ↓
Catch error (lib/rag.ts:354)
    console.error('Error searching jurisprudence:', error)
    return []  ← ❌ Retourne tableau vide
    ↓
RAG retourne 0 jurisprudence
```

### Logs Actuels

```
⚖️  JURISPRUDENCE SEARCH
   • Limit: 8
   • Threshold: 0.40
   ❌ Error searching jurisprudence: {error}
   ✅ Retrieved 0 case law documents with embeddings  ← ❌ Toujours 0
   ⚠️  No jurisprudence found after filtering!
```

---

## 🧪 Script de Test Créé

**Fichier** : `scripts/test-rag-jurisprudence.ts`

### Fonctionnalités

Le script teste 3 scénarios :

#### 1️⃣ Recherche Directe `case_law`
```typescript
const { data, error } = await supabase
  .from('case_law')
  .select('*');
```

**Résultat attendu** : ❌ Erreur "relation does not exist"

#### 2️⃣ Recherche Directe `jurisprudence`
```typescript
const { data, error } = await supabase
  .from('jurisprudence')
  .select('*');
```

**Résultat attendu** : ✅ X décisions retournées (si importées)

#### 3️⃣ Recherche via `lib/rag.ts`
```typescript
const sources = await searchRelevantSources(query);
```

**Résultat attendu** : ❌ 0 jurisprudence (car cherche dans case_law)

### Usage

```bash
npx tsx scripts/test-rag-jurisprudence.ts
```

**Output attendu** :
```
╔══════════════════════════════════════════════════════════════════════╗
║   🧪 TEST RAG JURISPRUDENCE - DIAGNOSTIC COMPLET                    ║
╚══════════════════════════════════════════════════════════════════════╝

🔍 Requête de test: "responsabilité civile article 1240"

1️⃣  RECHERCHE DIRECTE SUPABASE - TABLE case_law
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ❌ Erreur table case_law: relation "case_law" does not exist
   ⚠️  La table 'case_law' n'existe pas dans Supabase !

2️⃣  RECHERCHE DIRECTE SUPABASE - TABLE jurisprudence
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ✅ Table jurisprudence existe
   📊 Nombre total de décisions: 2017
   ✅ 2017 décisions trouvées avec embeddings

   🎯 Top 5 résultats par score de similarité:

   1. Score: 0.8234 (82.34%)
      Titre: Cass. 1re civ., 10 juill. 2013, n° 12-19.667
      ...

3️⃣  RECHERCHE VIA lib/rag.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📚 Articles trouvés: 3
   ⚖️  Jurisprudence trouvée: 0

   ❌ PROBLÈME: Le RAG ne retourne AUCUNE jurisprudence
   💡 Vérifier la fonction searchRelevantJurisprudence dans lib/rag.ts

╔══════════════════════════════════════════════════════════════════════╗
║   🔬 DIAGNOSTIC FINAL                                                ║
╚══════════════════════════════════════════════════════════════════════╝

⚠️  PROBLÈME IDENTIFIÉ:

   Le code cherche dans case_law, mais seule jurisprudence existe !
   - Table case_law: ❌ Inexistante
   - Table jurisprudence: ✅ Existe (2017 décisions)

💡 SOLUTIONS POSSIBLES:
   A) Créer case_law et migrer les données de jurisprudence
   B) Modifier lib/rag.ts pour lire jurisprudence au lieu de case_law

📁 Fichiers à modifier:
   - lib/rag.ts ligne 338 : .from('case_law') → .from('jurisprudence')
```

---

## 💡 Solutions Détaillées

### Solution A (RECOMMANDÉE) : Créer les tables manquantes

#### Étape 1 : Migration SQL

**Créer** : `supabase/migrations/create_case_law_tables.sql`

```sql
-- Table jurisdictions
CREATE TABLE jurisdictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO jurisdictions (name, type) VALUES
  ('Cour de cassation', 'cassation'),
  ('Conseil d''État', 'conseil_etat')
ON CONFLICT (name) DO NOTHING;

-- Table case_law
CREATE TABLE case_law (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID NOT NULL REFERENCES jurisdictions(id),
  title TEXT NOT NULL,
  decision_date DATE NOT NULL,
  decision_number TEXT UNIQUE,
  summary TEXT,
  full_text TEXT NOT NULL,
  embedding VECTOR(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_law_embedding ON case_law
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### Étape 2 : Script de Migration de Données

**Créer** : `scripts/migrate-jurisprudence-to-case-law.ts`

```typescript
// Migrer les données de jurisprudence vers case_law
// 1. Créer juridiction depuis jurisprudence.juridiction
// 2. Insérer dans case_law avec FK vers jurisdiction_id
```

#### Étape 3 : Importer

```bash
# Appliquer migration
# Via Supabase Dashboard SQL Editor

# Migrer données
npx tsx scripts/migrate-jurisprudence-to-case-law.ts

# OU importer directement
npx tsx scripts/import-cass-xml.ts --limit=2000
```

---

### Solution B (RAPIDE) : Adapter le code pour lire `jurisprudence`

#### Fichier : `lib/rag.ts`

**Ligne 338 - AVANT** :
```typescript
const { data, error } = await supabaseServer
  .from('case_law')
  .select(`
    id,
    title,
    decision_date,
    decision_number,
    summary,
    full_text,
    embedding,
    jurisdictions!inner (
      name
    )
  `)
  .not('embedding', 'is', null)
  .limit(500);
```

**Ligne 338 - APRÈS** :
```typescript
const { data, error } = await supabaseServer
  .from('jurisprudence')  // ✅ Utiliser la table existante
  .select('*')            // ✅ Pas de JOIN nécessaire
  .not('embedding', 'is', null)
  .limit(500);
```

**Ligne 392-409 - Adapter le mapping** :
```typescript
// AVANT
return {
  id: caselaw.id,
  juridiction: caselaw.jurisdictions?.name || 'Juridiction inconnue',  // ❌ JOIN
  date: formattedDate,
  numero: caselaw.decision_number || 'N/A',
  nom_usuel: null,
  titre: caselaw.title || 'Sans titre',
  faits: caselaw.full_text?.substring(0, 500) || '',
  solution: caselaw.summary || 'Non spécifié',
  principe: caselaw.summary || '',
  // ...
};

// APRÈS
return {
  id: caselaw.id,
  juridiction: caselaw.juridiction,  // ✅ Champ direct
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
  // ...
};
```

**Avantages** :
- ✅ Fix immédiat (5 minutes)
- ✅ Utilise les données déjà présentes
- ✅ Pas de migration nécessaire

**Inconvénients** :
- ⚠️ Divergence entre schéma et code
- ⚠️ Scripts d'import (`import-cass-xml.ts`) devront aussi être modifiés

---

## 🔍 Points de Vérification

### Checklist Avant Application

- [ ] Vérifier que la table `jurisprudence` existe
  ```sql
  SELECT COUNT(*) FROM jurisprudence;
  ```

- [ ] Vérifier que les embeddings sont présents
  ```sql
  SELECT COUNT(embedding) FROM jurisprudence WHERE embedding IS NOT NULL;
  ```

- [ ] Vérifier la dimension des embeddings
  ```sql
  SELECT AVG(array_length(embedding::vector, 1)) FROM jurisprudence WHERE embedding IS NOT NULL;
  -- Doit retourner 1024
  ```

### Checklist Après Application

- [ ] Exécuter le script de test
  ```bash
  npx tsx scripts/test-rag-jurisprudence.ts
  ```

- [ ] Vérifier que le RAG retourne des résultats
  ```
  ⚖️  Jurisprudence trouvée: X (X > 0)
  ```

- [ ] Tester une vraie requête dans l'interface
  ```
  "Quelle jurisprudence sur la responsabilité civile ?"
  ```

- [ ] Vérifier que le prompt contient la section jurisprudence
  ```
  ⚖️⚖️⚖️ JURISPRUDENCE DISPONIBLE (À CITER OBLIGATOIREMENT !) ⚖️⚖️⚖️
  ```

---

## 📊 Métriques Cibles

Une fois le problème résolu :

| Métrique | Valeur Cible |
|----------|--------------|
| Jurisprudence retournée par RAG | > 0 (idéalement 3-8) |
| Temps de recherche | < 2 secondes |
| Score de similarité moyen | > 0.40 |
| Taux de succès | 100% |

---

## 🎓 Résumé Technique

**Problème** : Incohérence entre schéma SQL et code TypeScript

**Cause** : Tables `case_law` + `jurisdictions` n'existent pas, mais le code les utilise

**Impact** : 0 jurisprudence retournée systématiquement

**Solutions** :
1. Créer les tables manquantes (30-60 min)
2. Adapter le code pour lire `jurisprudence` (5 min)

**Recommandation** : Solution 2 pour un fix immédiat, puis Solution 1 pour normaliser

---

**Document créé le** : 2025-11-04
**Mis à jour le** : 2025-11-04
**Auteur** : Claude Code Diagnostic System
