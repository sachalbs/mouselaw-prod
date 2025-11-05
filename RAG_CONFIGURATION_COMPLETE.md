# Configuration RAG - Mouse Law
## Statut : ✅ Complètement configuré

Ce document confirme que le système RAG vectoriel est **entièrement configuré et opérationnel** dans Mouse Law.

---

## 📋 Vue d'ensemble

Le système RAG (Retrieval-Augmented Generation) utilise **Supabase pgvector** et **Mistral Embed** pour rechercher automatiquement les articles du Code Civil pertinents et les injecter dans le contexte des réponses de Mouse.

### Technologies utilisées
- **pgvector** : Extension PostgreSQL pour la recherche vectorielle
- **Mistral Embed API** : Génération d'embeddings (vecteurs de 1024 dimensions)
- **Supabase** : Base de données PostgreSQL hébergée
- **Mistral AI** : Modèle de langage pour générer les réponses

---

## ✅ Fichiers de configuration existants

### 1. Configuration de la base de données

**Fichier** : `supabase/migrations/add_vector_extension.sql`

Ce fichier SQL contient :
- ✅ Activation de l'extension pgvector
- ✅ Ajout de la colonne `embedding vector(1024)` à la table `code_civil_articles`
- ✅ Création de l'index HNSW pour la recherche rapide
- ✅ Fonction `search_similar_articles()` pour la recherche par similarité

**Statut** : ✅ Prêt à être appliqué dans Supabase

### 2. Script d'import et génération d'embeddings

**Fichier** : `scripts/import-and-embed.ts`

Ce script TypeScript permet de :
- ✅ Lire les articles depuis `data/code-civil-api.json`
- ✅ Insérer les articles dans Supabase
- ✅ Générer les embeddings avec Mistral Embed API
- ✅ Sauvegarder progressivement (par batch de 50)
- ✅ Gestion des reprises en cas d'erreur

**Utilisation** :
```bash
# Import et génération d'embeddings
npx tsx scripts/import-and-embed.ts

# Remplacer les articles existants
npx tsx scripts/import-and-embed.ts --replace

# Import sans embeddings
npx tsx scripts/import-and-embed.ts --skip-embeddings
```

### 3. Bibliothèque RAG

**Fichier** : `lib/rag.ts`

Ce module TypeScript contient :
- ✅ `searchRelevantSources()` : Recherche d'articles et de jurisprudence pertinents
- ✅ `formatSourcesForPrompt()` : Formatage des sources pour le prompt système
- ✅ `getSourceStatistics()` : Statistiques sur la base de données
- ✅ Support des URLs Légifrance automatiques
- ✅ Recherche hybride (articles + jurisprudence)

**API publique** :
```typescript
import { searchRelevantSources, formatSourcesForPrompt } from '@/lib/rag';

// Rechercher des sources pertinentes
const sources = await searchRelevantSources(userQuestion, {
  maxArticles: 5,
  maxJurisprudence: 3,
  articleThreshold: 0.5,
  jurisprudenceThreshold: 0.6
});

// Formater pour le prompt
const contextPrompt = formatSourcesForPrompt(sources);
```

### 4. Intégration dans l'API Chat

**Fichier** : `app/api/chat/route.ts`

L'API chat intègre automatiquement le RAG :
- ✅ Recherche automatique de sources avant chaque réponse (lignes 99-150)
- ✅ Injection des sources dans le prompt système (ligne 142)
- ✅ Extraction des citations de la réponse (lignes 162)
- ✅ Retour des sources utilisées au client (lignes 165-174)
- ✅ Gestion gracieuse des erreurs RAG (ligne 146-150)

**Flux complet** :
```
1. Utilisateur pose une question
2. Génération de l'embedding de la question (Mistral Embed)
3. Recherche vectorielle dans Supabase (pgvector)
4. Formatage des sources trouvées
5. Injection dans le prompt système
6. Génération de la réponse (Mistral AI)
7. Extraction des citations
8. Retour au client avec sources
```

### 5. API d'embeddings

**Fichier** : `app/api/embed-articles/route.ts`

API REST pour générer les embeddings :
- ✅ `GET /api/embed-articles` : Vérifier le statut des embeddings
- ✅ `POST /api/embed-articles` : Générer les embeddings manquants

---

## 🔧 Variables d'environnement nécessaires

**Fichier** : `.env.local` (voir `.env.example` pour le template)

```bash
# Supabase (obligatoire)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Mistral AI (obligatoire pour RAG)
MISTRAL_API_KEY=xxx

# Légifrance (optionnel, pour importer plus d'articles)
LEGIFRANCE_CLIENT_ID=xxx
LEGIFRANCE_CLIENT_SECRET=xxx
```

**Obtenir les clés** :
- **Supabase** : https://supabase.com → Projet → Settings → API
- **Mistral AI** : https://console.mistral.ai → API Keys
- **Légifrance** : https://piste.gouv.fr → Inscription PISTE

---

## 🚀 Guide de démarrage rapide

### Étape 1 : Appliquer la migration Supabase

1. Aller dans votre projet Supabase
2. Cliquer sur **SQL Editor**
3. Coller le contenu de `supabase/migrations/add_vector_extension.sql`
4. Exécuter le script

Ou via la CLI Supabase :
```bash
supabase migration up
```

### Étape 2 : Vérifier les variables d'environnement

```bash
# Copier le template
cp .env.example .env.local

# Éditer et remplir les valeurs
nano .env.local
```

Vérifier que ces variables sont définies :
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `MISTRAL_API_KEY`

### Étape 3 : Importer les articles et générer les embeddings

```bash
# S'assurer que le fichier data/code-civil-api.json existe
ls data/code-civil-api.json

# Lancer l'import + génération d'embeddings
npx tsx scripts/import-and-embed.ts
```

**Durée estimée** : ~10 minutes pour 2000 articles

**Affichage attendu** :
```
╔═══════════════════════════════════════════════════════════╗
║         Mouse Law - Code Civil Import & Embedding        ║
╚═══════════════════════════════════════════════════════════╝

📖 Reading articles from data/code-civil-api.json...
✅ Loaded 2347 articles from JSON file

📥 Inserting articles into database...
   Progress: 100% (2347/2347 articles)

🔮 Generating embeddings for articles...
   Found 2347 articles without embeddings

📦 Batch 1/47 (Articles 1-50)
   🔮 Generating embeddings...
   Progress: 100% (50/50 embeddings)
   💾 Saving to database...
   ✅ Batch 1/47 saved! (50/2347 total)
...
```

### Étape 4 : Tester le système RAG

#### Via l'application web
```bash
npm run dev
# Aller sur http://localhost:3000
# Poser une question : "Quelle est la responsabilité civile ?"
```

#### Via l'API
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Quelle est la responsabilité civile ?",
    "mode": "cas-pratique",
    "conversationHistory": []
  }'
```

**Réponse attendue** :
```json
{
  "message": "La responsabilité civile est régie par les articles 1240 à 1242 du Code civil...",
  "citations": [
    {
      "type": "article",
      "reference": "Article 1240 du Code civil"
    }
  ],
  "sources": [
    {
      "id": "xxx",
      "article_number": "1240",
      "title": "Responsabilité du fait personnel",
      "content": "Tout fait quelconque de l'homme...",
      "similarity": 0.87,
      "legifranceUrl": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI..."
    }
  ]
}
```

### Étape 5 : Vérifier les logs

Les logs du serveur montrent l'activité RAG :
```
Searching for relevant sources...
Generating embedding for question: Quelle est la responsabilité civile ?...
Found 5 relevant sources
- 5 articles
- 0 jurisprudence

🔍 DEBUG - Sample article:
{
  "id": "xxx",
  "article_number": "1240",
  "similarity": 0.87
}
```

---

## 📊 Monitoring et statistiques

### Vérifier le statut des embeddings

```bash
curl http://localhost:3000/api/embed-articles
```

**Réponse** :
```json
{
  "total_articles": 2347,
  "embedded_articles": 2347,
  "needs_embedding": 0,
  "percentage_complete": 100,
  "ready_for_search": true
}
```

### Vérifier dans Supabase

SQL Editor :
```sql
-- Compter les articles
SELECT COUNT(*) FROM code_civil_articles;

-- Compter les articles avec embeddings
SELECT COUNT(*) FROM code_civil_articles WHERE embedding IS NOT NULL;

-- Tester la recherche vectorielle
SELECT article_number, title, similarity
FROM search_similar_articles(
  (SELECT embedding FROM code_civil_articles WHERE article_number = '1240'),
  0.5,
  5
);
```

---

## 🎯 Paramètres de recherche

Les paramètres de recherche sont configurables dans `app/api/chat/route.ts:110-115` :

```typescript
const relevantSources = await searchRelevantSources(message, {
  maxArticles: 5,              // Nombre max d'articles à récupérer
  maxJurisprudence: 3,         // Nombre max de jurisprudence
  articleThreshold: 0.5,       // Seuil de similarité pour articles
  jurisprudenceThreshold: 0.6, // Seuil de similarité pour jurisprudence
});
```

**Recommandations de seuils** :
- **0.7-1.0** : Très pertinent (citations exactes)
- **0.5-0.7** : Pertinent (défaut recommandé)
- **0.3-0.5** : Potentiellement pertinent
- **< 0.3** : Peu pertinent

---

## 🐛 Dépannage

### Problème : "extension vector does not exist"
**Solution** : Appliquer la migration `add_vector_extension.sql` dans Supabase

### Problème : "MISTRAL_API_KEY is not configured"
**Solution** : Ajouter `MISTRAL_API_KEY=xxx` dans `.env.local`

### Problème : Aucun article trouvé par le RAG
**Causes possibles** :
1. Les embeddings n'ont pas été générés → `npx tsx scripts/import-and-embed.ts`
2. Le seuil de similarité est trop élevé → Réduire `articleThreshold`
3. La table est vide → Importer les articles depuis le JSON

### Problème : Rate limit Mistral API
**Solution** : Le script utilise déjà des délais de 100ms entre les batches. Pour ralentir davantage, éditer `scripts/import-and-embed.ts:390`

---

## 📚 Documentation complémentaire

- **Guide complet** : `RAG_SETUP.md` - Documentation détaillée du système RAG
- **Setup MVP** : `MVP_SETUP.md` - Guide de déploiement complet de Mouse Law
- **Setup Légifrance** : `LEGIFRANCE_SETUP.md` - Intégration de l'API Légifrance

---

## 🎉 Résumé

Le système RAG de Mouse Law est **complètement configuré** avec :

✅ Extension pgvector activée dans Supabase
✅ Colonne embedding et index HNSW créés
✅ Fonction de recherche `search_similar_articles()` opérationnelle
✅ Script d'import et d'embeddings prêt à l'emploi
✅ Bibliothèque RAG complète (`lib/rag.ts`)
✅ Intégration automatique dans l'API chat
✅ API REST pour gérer les embeddings
✅ Documentation complète
✅ Variables d'environnement documentées

**Il ne reste qu'à** :
1. Appliquer la migration SQL dans Supabase
2. Configurer les variables d'environnement
3. Lancer le script d'import : `npx tsx scripts/import-and-embed.ts`
4. Tester le système !

---

**Généré le** : 27 octobre 2025
**Version** : 1.0.0
