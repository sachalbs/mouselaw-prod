# 🚀 Guide d'importation universelle des codes juridiques français

Ce guide explique comment importer **tous les codes juridiques français** dans MouseLaw avec génération automatique des embeddings pour le système RAG.

## 📋 Prérequis

### 1. Structure de base de données

Assurez-vous que les tables suivantes existent :

```sql
-- Table des codes juridiques (référentiel)
legal_codes (
  id UUID PRIMARY KEY,
  code_name TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  legifrance_id TEXT UNIQUE NOT NULL,
  description TEXT
)

-- Table des articles (avec embeddings)
legal_articles (
  id UUID PRIMARY KEY,
  code_id UUID REFERENCES legal_codes(id),
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
  UNIQUE(code_id, article_number)
)
```

### 2. Variables d'environnement

Vérifiez que votre fichier `.env.local` contient :

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Mistral AI
MISTRAL_API_KEY=your-mistral-api-key

# Légifrance API (PISTE)
LEGIFRANCE_CLIENT_ID=your-client-id
LEGIFRANCE_CLIENT_SECRET=your-client-secret
```

### 3. Codes juridiques supportés

Les 6 codes importés automatiquement :

| Code | Légifrance ID | Articles estimés |
|------|---------------|------------------|
| Code Civil | LEGITEXT000006070721 | ~2500 |
| Code Pénal | LEGITEXT000006070719 | ~800 |
| Code du Travail | LEGITEXT000006072050 | ~7000 |
| Code de Commerce | LEGITEXT000005634379 | ~900 |
| Code de Procédure Civile | LEGITEXT000006070716 | ~1500 |
| Code de Procédure Pénale | LEGITEXT000006071154 | ~900 |

**Total estimé : ~13 000 articles**

---

## 🚀 Utilisation

### Import complet (tous les codes)

```bash
npx tsx scripts/import-all-codes.ts
```

**Ce script effectue automatiquement :**
1. ✅ Récupération des codes depuis `legal_codes`
2. ✅ Authentification OAuth PISTE
3. ✅ Récupération des articles via l'API Légifrance
4. ✅ Insertion dans `legal_articles` (UPSERT)
5. ✅ Génération des embeddings Mistral (1024 dimensions)
6. ✅ Mise à jour des embeddings dans la BDD

**Durée estimée :**
- **Récupération articles** : 10-15 minutes (tous les codes)
- **Génération embeddings** : 2-4 heures (~13 000 articles)
- **Total** : 2h30 à 4h30

### Vérifier la progression

```bash
npx tsx scripts/check-import-progress.ts
```

**Affiche :**
- 📊 Statistiques globales (total articles, embeddings)
- 📖 Statistiques par code (progression détaillée)
- ⚠️ Liste des articles sans embeddings
- 💡 Recommandations

---

## 📊 Exemple de sortie

### Import complet

```
🚀 IMPORTATION UNIVERSELLE DES CODES JURIDIQUES - MOUSE LAW

======================================================================
✅ Variables d'environnement OK

📚 Récupération des codes juridiques depuis Supabase...
✅ 6 codes trouvés:
   • Code Civil (LEGITEXT000006070721)
   • Code Pénal (LEGITEXT000006070719)
   • Code du Travail (LEGITEXT000006072050)
   • Code de Commerce (LEGITEXT000005634379)
   • Code de Procédure Civile (LEGITEXT000006070716)
   • Code de Procédure Pénale (LEGITEXT000006071154)

🔐 Obtention du token OAuth PISTE...
✅ Token OAuth obtenu

======================================================================
📖 TRAITEMENT : Code Civil
======================================================================

📥 Récupération des articles du Code Civil...
   ✅ Réponse reçue de Légifrance
   ✅ 2534 articles extraits

💾 Insertion des articles dans legal_articles...
   ✅ Batch 1/51 - 50 articles (50/2534)
   ✅ Batch 2/51 - 50 articles (100/2534)
   ...
   ✅ 2534 articles insérés/mis à jour

🧠 Génération des embeddings pour Code Civil...
   🎯 2534 articles à traiter

   📦 Batch 1/51 (50 articles)...
      ⏳ 10/2534 traités...
      ⏳ 20/2534 traités...
      ...
   ✅ 2534 embeddings générés avec succès

✅ Code Civil traité avec succès !

[... traitement des 5 autres codes ...]

======================================================================
🎉 IMPORTATION TERMINÉE AVEC SUCCÈS !
======================================================================

📊 STATISTIQUES FINALES :
   • Total d'articles : 13,215
   • Articles avec embeddings : 13,215
   • Pourcentage : 100.0%

💡 Exécutez "npx tsx scripts/check-import-progress.ts" pour plus de détails.
```

### Vérification de progression

```
🔍 VÉRIFICATION DE LA PROGRESSION D'IMPORT

📚 Récupération des codes juridiques...
✅ 6 codes trouvés

⏳ Analyse de Code Civil... ✅
⏳ Analyse de Code Pénal... ✅
⏳ Analyse de Code du Travail... ✅
⏳ Analyse de Code de Commerce... ✅
⏳ Analyse de Code de Procédure Civile... ✅
⏳ Analyse de Code de Procédure Pénale... ✅

======================================================================
📊 STATISTIQUES GLOBALES
======================================================================

📚 Total d'articles : 13,215
✅ Avec embeddings : 13,215
❌ Sans embeddings : 0
📈 Progression globale : 100.00%

[██████████████████████████████████████████████████] 100.0%

======================================================================
📖 STATISTIQUES PAR CODE JURIDIQUE
======================================================================

🟢 CODE CIVIL
   Code Civil
   ────────────────────────────────────────────────────────────
   Total d'articles      : 2,534
   ✅ Avec embeddings    : 2,534
   ❌ Sans embeddings    : 0
   Progression           : [██████████████████████████████] 100.0%

🟢 CODE PENAL
   Code Pénal
   ────────────────────────────────────────────────────────────
   Total d'articles      : 812
   ✅ Avec embeddings    : 812
   ❌ Sans embeddings    : 0
   Progression           : [██████████████████████████████] 100.0%

[... autres codes ...]

======================================================================
💡 RECOMMANDATIONS
======================================================================

✅ Tous les codes sont complets avec embeddings !
   → Votre base de données RAG est prête à être utilisée.

📚 Pour tester le système RAG :
   npx tsx scripts/test-new-rag.ts

======================================================================
✅ Vérification terminée
```

---

## ⚙️ Configuration avancée

### Ajuster les performances

Dans `import-all-codes.ts`, vous pouvez modifier :

```typescript
const BATCH_SIZE = 50;           // Taille des batches d'insertion
const EMBEDDING_DELAY = 2000;    // Délai entre batches d'embeddings (ms)
const REQUEST_DELAY = 500;       // Délai entre codes (ms)
```

**Recommandations :**
- **Si erreurs 429 Mistral** : Augmentez `EMBEDDING_DELAY` à 3000-5000ms
- **Si erreurs réseau** : Diminuez `BATCH_SIZE` à 25-30
- **Si erreurs PISTE** : Augmentez `REQUEST_DELAY` à 1000ms

---

## 🔧 Reprendre après une interruption

Les scripts sont **idempotents** et peuvent être relancés sans risque :

```bash
# Si le script s'arrête, relancez-le simplement
npx tsx scripts/import-all-codes.ts
```

**Comportement :**
- ✅ Articles existants → Mis à jour (UPSERT)
- ✅ Articles avec embeddings → Ignorés
- ✅ Seuls les articles sans embeddings sont traités

---

## 🐛 Dépannage

### Erreur : "Variable d'environnement manquante"

```bash
# Vérifiez vos variables
cat .env.local | grep MISTRAL
cat .env.local | grep LEGIFRANCE
cat .env.local | grep SUPABASE
```

### Erreur : "Aucun code trouvé dans legal_codes"

```sql
-- Vérifiez que la table existe et est remplie
SELECT * FROM legal_codes;
```

Si vide, exécutez la migration qui insère les 6 codes.

### Erreur 429 (Too Many Requests)

**Mistral API :**
```typescript
// Augmentez le délai dans import-all-codes.ts
const EMBEDDING_DELAY = 5000; // 5 secondes
```

**Légifrance PISTE :**
```typescript
// Augmentez le délai entre codes
const REQUEST_DELAY = 2000; // 2 secondes
```

### Articles manquants après import

```bash
# Vérifiez les logs du script
# Relancez l'import (il complétera les manquants)
npx tsx scripts/import-all-codes.ts
```

---

## 📈 Vérification post-import

### 1. Compter les articles par code

```sql
SELECT
  lc.code_name,
  COUNT(la.id) as total_articles,
  COUNT(la.embedding) as with_embeddings,
  ROUND(100.0 * COUNT(la.embedding) / NULLIF(COUNT(la.id), 0), 1) as percentage
FROM legal_codes lc
LEFT JOIN legal_articles la ON la.code_id = lc.id
GROUP BY lc.code_name
ORDER BY lc.code_name;
```

### 2. Tester la recherche vectorielle

```sql
-- Rechercher des articles sur la responsabilité civile
SELECT
  lc.code_name,
  la.article_number,
  la.title,
  1 - (la.embedding <=> (
    SELECT embedding FROM legal_articles WHERE article_number = '1240' LIMIT 1
  )) as similarity
FROM legal_articles la
JOIN legal_codes lc ON lc.id = la.code_id
WHERE la.embedding IS NOT NULL
ORDER BY similarity DESC
LIMIT 10;
```

### 3. Vérifier les embeddings

```sql
SELECT
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings,
  ROUND(100.0 * COUNT(embedding) / COUNT(*), 1) as percentage
FROM legal_articles;
```

---

## ⚠️ Limitations & Rate Limits

### API Légifrance (PISTE)
- **Rate limit** : Variable selon abonnement
- **Timeout** : 30 secondes par requête
- **Recommandation** : Pause de 500ms entre codes

### API Mistral AI
- **Rate limit** : Selon votre plan (tier)
- **Embedding** : 1024 dimensions
- **Recommandation** : Pause de 2s entre batches de 50

### Temps d'exécution

Pour **~13 000 articles** (6 codes) :
- Récupération Légifrance : **10-15 min**
- Insertion Supabase : **5-10 min**
- Génération embeddings : **2-4 heures**

**Total : 2h30 à 4h30** (laisser tourner en arrière-plan)

---

## 💾 Structure des données importées

Chaque article contient :

```typescript
{
  code_id: "uuid-du-code",
  article_number: "1240",
  title: "Responsabilité du fait personnel",
  content: "Tout fait quelconque de l'homme...",
  section_path: "Livre III > Titre IV > Chapitre II > Section 1",
  book: "Livre III - Des différentes manières...",
  title_section: "Titre IV - Des sûretés",
  chapter: "Chapitre II - De la responsabilité civile",
  legifrance_id: "LEGIARTI000006437042",
  legifrance_url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006437042",
  embedding: [0.123, -0.456, ...] // 1024 dimensions
}
```

---

## 🔄 Mise à jour des articles

Pour mettre à jour (nouvelles lois, modifications) :

```bash
# Relancez simplement le script
npx tsx scripts/import-all-codes.ts
```

Les articles existants seront mis à jour grâce à `UPSERT ON CONFLICT (code_id, article_number)`.

---

## 💡 Prochaines étapes

Après l'importation complète :

1. ✅ **Vérifier** : `npx tsx scripts/check-import-progress.ts`
2. ✅ **Tester le RAG** : `npx tsx scripts/test-new-rag.ts`
3. ✅ **Adapter l'API `/api/chat`** pour utiliser `legal_articles`
4. ✅ **Configurer les filtres** par code dans l'interface

---

## 📞 Support

En cas de problème :
1. Consultez les logs détaillés du script
2. Vérifiez les quotas API (Mistral + PISTE)
3. Relancez le script (il reprendra où il s'est arrêté)
4. Ouvrez une issue GitHub avec les logs d'erreur

---

## 🎯 Résumé des commandes

```bash
# Import complet de tous les codes
npx tsx scripts/import-all-codes.ts

# Vérifier la progression
npx tsx scripts/check-import-progress.ts

# Tester le système RAG
npx tsx scripts/test-new-rag.ts
```

**C'est tout ! 🚀**
