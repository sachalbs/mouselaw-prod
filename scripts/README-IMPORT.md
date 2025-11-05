# Guide d'importation du Code civil - Mouse Law

Ce guide explique comment importer les articles du Code civil français dans Mouse Law avec génération automatique des embeddings pour le système RAG.

## 📋 Prérequis

### 1. Variables d'environnement

Ajoutez ces variables dans votre fichier `.env.local` :

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

### 2. Obtenir les identifiants Légifrance

1. Créez un compte sur [PISTE Légifrance](https://piste.gouv.fr)
2. Créez une application pour obtenir vos identifiants OAuth
3. Notez votre `client_id` et `client_secret`

### 3. Migrations Supabase

Exécutez les migrations nécessaires dans le SQL Editor de Supabase :

```bash
# 1. Extension vector (si pas déjà fait)
supabase/migrations/add_vector_extension.sql

# 2. Colonnes Légifrance (si pas déjà fait)
supabase/migrations/add_legifrance_ids.sql

# 3. Colonnes structure du Code civil (NOUVEAU)
supabase/migrations/add_code_structure_columns.sql
```

## 🚀 Utilisation

### Importation complète

Pour importer tout le Code civil et générer les embeddings :

```bash
npx tsx scripts/import-civil-code.ts
```

Le script effectue 3 étapes :
1. ✅ Récupération des articles depuis l'API Légifrance
2. ✅ Insertion dans Supabase (table `code_civil_articles`)
3. ✅ Génération des embeddings avec Mistral AI

### Reprendre après une interruption

Le script est **idempotent** et peut être relancé sans risque :
- Les articles déjà importés sont mis à jour (ON CONFLICT)
- Seuls les articles sans embeddings sont traités
- La progression est affichée en temps réel

```bash
# Si le script s'arrête, relancez-le simplement
npx tsx scripts/import-civil-code.ts
```

## 📊 Sortie du script

### Exemple de sortie réussie

```
🚀 Importation du Code civil - Mouse Law

============================================================
✅ Variables d'environnement OK

📥 Récupération des articles depuis Légifrance...
✅ Données reçues de Légifrance
✅ 2534 articles extraits

💾 Insertion des articles dans Supabase...
   ✅ Batch 1/26 - 100 articles (100/2534)
   ✅ Batch 2/26 - 100 articles (200/2534)
   ...
✅ 2534 articles insérés avec succès

🧠 Génération des embeddings...
📊 État actuel: 0/2534 articles avec embeddings
🎯 2534 articles à traiter

📦 Batch 1/26 (100 articles)...
   ⏳ 10/2534 traités...
   ⏳ 20/2534 traités...
   ...
   ⏸️  Pause de 2s...

📦 Batch 2/26 (100 articles)...
   ...

✅ 2534 embeddings générés avec succès

============================================================
🎉 Importation terminée avec succès !
```

## 🔧 Paramètres configurables

Dans le fichier `import-civil-code.ts`, vous pouvez ajuster :

```typescript
const BATCH_SIZE = 100;           // Taille des batches (articles)
const EMBEDDING_DELAY = 2000;     // Délai entre batches (ms)
```

## ⚠️ Limitations & Rate Limits

### API Légifrance
- Rate limit : Varie selon votre abonnement PISTE
- Si erreur 429 : Augmentez les délais entre requêtes

### API Mistral AI
- Rate limit : Selon votre plan
- Le script fait des pauses de 2s entre chaque batch de 100 articles
- En cas d'erreur 429 : Augmentez `EMBEDDING_DELAY`

### Temps d'exécution estimé

Pour ~2500 articles du Code civil :
- **Récupération Légifrance** : 1-2 minutes
- **Insertion Supabase** : 1-2 minutes
- **Génération embeddings** : 15-30 minutes (selon rate limits)

**Durée totale** : 20-35 minutes

## 🐛 Dépannage

### Erreur : "LEGIFRANCE_CLIENT_ID manquante"

```bash
# Vérifiez que vos variables d'env sont bien définies
echo $LEGIFRANCE_CLIENT_ID
echo $LEGIFRANCE_CLIENT_SECRET
```

### Erreur : "Mistral API key not configured"

```bash
# Vérifiez votre clé API Mistral
echo $MISTRAL_API_KEY
```

### Erreur : "column does not exist"

Exécutez la migration manquante :
```sql
-- Dans Supabase SQL Editor
supabase/migrations/add_code_structure_columns.sql
```

### Erreur 429 (Too Many Requests)

Augmentez les délais :
```typescript
const EMBEDDING_DELAY = 5000; // 5 secondes au lieu de 2
```

## 📈 Vérification post-import

### 1. Compter les articles importés

```sql
-- Dans Supabase SQL Editor
SELECT COUNT(*) FROM code_civil_articles;
-- Résultat attendu : ~2500-2600 articles
```

### 2. Vérifier les embeddings

```sql
SELECT
  COUNT(*) as total,
  COUNT(embedding) as avec_embeddings,
  ROUND(100.0 * COUNT(embedding) / COUNT(*), 1) as pourcentage
FROM code_civil_articles;
```

### 3. Tester la recherche vectorielle

```sql
-- Rechercher des articles sur la responsabilité civile
SELECT
  article_number,
  title,
  similarity
FROM search_similar_articles(
  (SELECT embedding FROM code_civil_articles WHERE article_number = '1240'),
  0.7,
  5
);
```

## 📚 Structure des données importées

Chaque article contient :

```typescript
{
  article_number: "1240",
  title: "Responsabilité du fait personnel",
  content: "Tout fait quelconque de l'homme...",
  book: "Livre III - Des différentes manières...",
  chapter: "Chapitre II - De la responsabilité civile",
  section: "Section 1 - Du fait personnel",
  category: null, // À remplir manuellement si besoin
  legifrance_id: "LEGIARTI000006437042",
  legifrance_url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006437042",
  embedding: [0.123, -0.456, ...] // 1024 dimensions
}
```

## 🔄 Mise à jour des articles

Pour mettre à jour les articles (par exemple après une modification législative) :

```bash
# Relancez simplement le script
npx tsx scripts/import-civil-code.ts
```

Les articles existants seront mis à jour grâce à `ON CONFLICT (article_number)`.

## 💡 Prochaines étapes

Après l'importation :
1. ✅ Testez le système RAG dans l'interface chat
2. ✅ Vérifiez la pertinence des articles retournés
3. ✅ Ajustez les seuils de similarité si nécessaire (dans `lib/rag.ts`)
4. ✅ Optionnel : Enrichissez manuellement le champ `category` pour améliorer les filtres

## 📞 Support

En cas de problème :
1. Vérifiez les logs du script
2. Consultez la documentation API Légifrance
3. Vérifiez les quotas Mistral AI
4. Ouvrez une issue GitHub avec les logs d'erreur
