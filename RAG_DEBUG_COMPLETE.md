# Debug et correction du système RAG - Mouse Law

## 🔍 Problème identifié

Le système RAG ne fonctionnait pas correctement. Après investigation, plusieurs problèmes ont été identifiés et corrigés.

---

## ✅ Corrections apportées

### 1. **Logs de debug améliorés dans `app/api/chat/route.ts`**

Ajout de logs détaillés pour tracer tout le processus RAG :

```typescript
// Lignes 100-176 de app/api/chat/route.ts
console.log('='.repeat(60));
console.log('🔍 RAG SYSTEM - STARTING SEARCH');
console.log('='.repeat(60));
console.log(`📝 User query: "${message}"`);
console.log(`🎯 Mode: ${mode}`);

// ... recherche RAG ...

console.log('📚 ARTICLES FOUND BY RAG:');
relevantSources.articles.forEach((article, idx) => {
  console.log(`   ${idx + 1}. Article ${article.article_number}`);
  console.log(`      Similarity: ${(article.similarity * 100).toFixed(1)}%`);
});
```

**Ce qu'on peut voir maintenant :**
- La requête de l'utilisateur
- Le nombre de sources trouvées
- Tous les articles trouvés avec leurs scores de similarité
- La longueur du prompt système enrichi
- Les erreurs potentielles avec détails

### 2. **Logs de debug dans `lib/rag.ts`**

Ajout de logs détaillés dans toutes les fonctions de recherche :

```typescript
// searchRelevantSources
console.log(`🔮 Generating embedding for question...`);
console.log(`✅ Embedding generated: ${queryEmbedding.length} dimensions`);
console.log(`Sample values: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}, ...]`);

// searchRelevantArticles
console.log(`🔍 Searching articles in database...`);
console.log(`   • Limit: ${limit}`);
console.log(`   • Threshold: ${matchThreshold}`);
console.log(`✅ Supabase returned ${data?.length || 0} articles`);

// En cas d'échec
console.log('⚠️  No articles found! Debugging info:');
console.log(`   • Total articles in DB: ${count || 0}`);
console.log(`   • Articles with embeddings: ${withEmbeddings || 0}`);
```

**Ce qu'on peut voir maintenant :**
- La génération d'embedding (dimensions, valeurs d'exemple)
- Les paramètres de recherche (seuil, limite)
- Le nombre d'articles en base
- Le nombre d'articles avec embeddings
- Les erreurs Supabase avec détails complets

### 3. **Prompt système renforcé**

Le prompt injecté est maintenant BEAUCOUP plus strict pour forcer Mistral à utiliser les articles :

```typescript
// lib/rag.ts - formatSourcesForPrompt()

╔════════════════════════════════════════════════════════════════╗
║    SOURCES JURIDIQUES VÉRIFIÉES - UTILISATION OBLIGATOIRE     ║
╚════════════════════════════════════════════════════════════════╝

⚠️  RÈGLE ABSOLUE ET NON NÉGOCIABLE :
Tu DOIS IMPÉRATIVEMENT commencer ta réponse par cette phrase exacte :
"Selon le Code civil, voici les articles applicables :"

Puis tu DOIS citer TOUS les articles ci-dessous dans ta réponse.

📚 ARTICLES DU CODE CIVIL À CITER OBLIGATOIREMENT :
   1. Article ${numero} du Code civil - ${titre}
      📜 CONTENU INTÉGRAL :
      ${contenu_complet}
      ✅ Pertinence : XX.X%

✅ TU DOIS :
1. Commencer par "Selon le Code civil, voici les articles applicables :"
2. Citer TOUS les articles ci-dessus avec leur NUMÉRO EXACT
3. Reprendre le CONTENU EXACT de chaque article (pas de paraphrase)
4. Expliquer comment chaque article s'applique à la situation

❌ TU NE DOIS JAMAIS :
1. Inventer ou mentionner des articles qui ne sont PAS dans la liste ci-dessus
2. Paraphraser les articles sans citer leur contenu exact
3. Répondre sans avoir cité au moins UN des articles ci-dessus
4. Dire "je ne connais pas" alors que des articles sont fournis

⚠️  Si tu ne cites pas les articles ci-dessus, ta réponse sera considérée comme INCORRECTE.
```

**Changements clés :**
- ✅ Titre avec cadre visuel imposant
- ✅ Instruction ABSOLUE de commencer par une phrase spécifique
- ✅ Affichage du CONTENU INTÉGRAL de chaque article
- ✅ Score de pertinence affiché
- ✅ Liste claire des DO et DON'T
- ✅ Avertissement en cas de non-respect

### 4. **Interface : affichage des sources**

L'interface existait déjà (lignes 217-229 de `app/chat/page.tsx`) :

```tsx
{message.role === 'assistant' && message.sources && message.sources.length > 0 && (
  <div className="mt-6 ml-4 space-y-3">
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      <BookOpen className="w-4 h-4 text-blue-600" />
      Sources juridiques citées
    </div>
    <div className="space-y-3">
      {message.sources.map((source) => (
        <SourceCard key={source.id} source={source} />
      ))}
    </div>
  </div>
)}
```

Le composant `SourceCard` affiche :
- 📜 Le numéro et titre de l'article
- 📝 Le contenu (avec bouton "Voir plus/moins")
- 🔗 Lien vers Légifrance
- ⚖️ Type de source (article ou jurisprudence)

### 5. **Script de test du RAG**

Nouveau fichier : `scripts/test-rag.ts`

Ce script teste le RAG avec 4 questions types :
1. "Quelle est la responsabilité civile ?" (articles attendus: 1240, 1241, 1242)
2. "Un piéton a été renversé par une voiture. Qui est responsable ?" (articles 1240-1242)
3. "Comment fonctionne un contrat ?" (articles 1103, 1104)
4. "Mon voisin a construit un mur qui me gêne" (articles sur servitudes)

**Usage :**
```bash
npx tsx scripts/test-rag.ts
```

**Affichage :**
- Question testée
- Articles trouvés avec scores de similarité
- Comparaison avec articles attendus
- Prompt formaté pour Mistral
- Taux de réussite final

---

## 🐛 Problème détecté lors des tests

### Erreur Supabase : "column code_civil_articles.numero does not exist"

```
❌ Supabase RPC error: {
  code: '42703',
  details: null,
  hint: null,
  message: 'column code_civil_articles.numero does not exist'
}
```

**Cause :** La fonction `search_similar_articles()` n'a pas été créée correctement dans Supabase, OU la table `code_civil_articles` n'a pas la bonne structure.

**Solutions possibles :**

### Solution 1 : Réappliquer la migration vectorielle

1. Aller dans Supabase Dashboard → SQL Editor
2. Exécuter ce SQL pour recréer la fonction :

```sql
-- Supprimer l'ancienne fonction
DROP FUNCTION IF EXISTS search_similar_articles(vector, float, int);

-- Recréer la fonction avec les bons noms de colonnes
CREATE OR REPLACE FUNCTION search_similar_articles(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  article_number text,
  title text,
  content text,
  category text,
  legifrance_id text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    code_civil_articles.id,
    code_civil_articles.article_number,
    code_civil_articles.title,
    code_civil_articles.content,
    code_civil_articles.category,
    code_civil_articles.legifrance_id,
    1 - (code_civil_articles.embedding <=> query_embedding) AS similarity
  FROM public.code_civil_articles
  WHERE code_civil_articles.embedding IS NOT NULL
    AND 1 - (code_civil_articles.embedding <=> query_embedding) > match_threshold
  ORDER BY code_civil_articles.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### Solution 2 : Vérifier la structure de la table

Exécuter dans Supabase SQL Editor :

```sql
-- Vérifier les colonnes de la table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'code_civil_articles'
ORDER BY ordinal_position;

-- Vérifier les fonctions existantes
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'search_similar_articles';

-- Compter les articles avec embeddings
SELECT
  COUNT(*) as total,
  COUNT(embedding) as with_embedding
FROM code_civil_articles;
```

### Solution 3 : Appliquer TOUTES les migrations dans l'ordre

```bash
# Dans Supabase SQL Editor, exécuter dans l'ordre :

1. supabase/migrations/add_vector_extension.sql
2. supabase/migrations/add_jurisprudence_table.sql
3. supabase/migrations/add_legifrance_ids.sql
4. supabase/migrations/fix_search_functions_add_legifrance_id.sql
```

---

## 📋 Checklist de diagnostic

Avant de tester, vérifier :

### ✅ Variables d'environnement (.env.local)

```bash
# Requis pour RAG
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
MISTRAL_API_KEY=xxx
```

### ✅ Structure Supabase

```sql
-- 1. Extension pgvector activée
SELECT * FROM pg_extension WHERE extname = 'vector';
-- Devrait retourner 1 ligne

-- 2. Colonne embedding existe
SELECT column_name FROM information_schema.columns
WHERE table_name = 'code_civil_articles' AND column_name = 'embedding';
-- Devrait retourner 'embedding'

-- 3. Fonction search_similar_articles existe
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'search_similar_articles';
-- Devrait retourner 'search_similar_articles'

-- 4. Des embeddings existent
SELECT COUNT(*) FROM code_civil_articles WHERE embedding IS NOT NULL;
-- Devrait retourner > 0
```

### ✅ Articles importés avec embeddings

```bash
# Vérifier le statut
curl http://localhost:3000/api/embed-articles

# Si besoin, importer et générer les embeddings
npx tsx scripts/import-and-embed.ts
```

---

## 🧪 Tests à effectuer

### Test 1 : Script de test RAG

```bash
npx tsx scripts/test-rag.ts
```

**Résultat attendu :**
```
✅ Embedding generated: 1024 dimensions
✅ Supabase returned 5 articles
✅ SUCCÈS: 3/3 articles attendus trouvés
🎉 Tous les tests sont passés!
```

**Si échec :**
- Vérifier les logs pour identifier l'erreur
- Vérifier la structure Supabase (voir checklist ci-dessus)
- Réappliquer les migrations si nécessaire

### Test 2 : Via l'interface web

1. Lancer le serveur : `npm run dev`
2. Aller sur http://localhost:3000/chat
3. Poser une question : "Quelle est la responsabilité civile ?"
4. Vérifier dans la console du serveur :

```
============================================================
🔍 RAG SYSTEM - STARTING SEARCH
============================================================
📝 User query: "Quelle est la responsabilité civile ?"
🎯 Mode: cas-pratique

🔮 Calling searchRelevantSources...
   🔮 Generating embedding for question...
   ✅ Embedding generated: 1024 dimensions

   🔍 Searching articles in database...
   ✅ Supabase returned 5 articles

📚 ARTICLES FOUND BY RAG:
   1. Article 1240 - Responsabilité du fait personnel
      Similarity: 87.3%
   2. Article 1241 - Responsabilité en cas de faute
      Similarity: 84.1%
...

📝 Injecting sources into system prompt...
✅ System prompt enriched with 5 sources
```

5. Vérifier la réponse de Mouse :
   - ✅ Commence par "Selon le Code civil, voici les articles applicables :"
   - ✅ Cite les articles 1240, 1241, 1242
   - ✅ Reprend le contenu exact des articles
   - ✅ Sources affichées en bas du message

### Test 3 : API directe

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Quelle est la responsabilité civile ?",
    "mode": "cas-pratique",
    "conversationHistory": []
  }'
```

**Réponse attendue :**
```json
{
  "message": "Selon le Code civil, voici les articles applicables :\n\nL'Article 1240 du Code civil dispose que...",
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
      "similarity": 0.873,
      "legifranceUrl": "https://www.legifrance.gouv.fr/codes/article_lc/..."
    }
  ]
}
```

---

## 📊 Métriques de succès

Le RAG fonctionne correctement si :

✅ **Logs côté serveur :**
- ✅ "RAG SYSTEM - STARTING SEARCH" apparaît
- ✅ Embedding généré avec 1024 dimensions
- ✅ Supabase retourne des articles (> 0)
- ✅ Articles affichés avec scores de similarité
- ✅ System prompt enrichi confirmé

✅ **Réponse de Mouse :**
- ✅ Commence par "Selon le Code civil, voici les articles applicables :"
- ✅ Cite au moins 1 article trouvé par le RAG
- ✅ Reprend le contenu exact de l'article
- ✅ N'invente pas d'articles

✅ **Interface utilisateur :**
- ✅ Section "Sources juridiques citées" visible
- ✅ Cards avec articles affichées
- ✅ Lien vers Légifrance fonctionnel
- ✅ Contenu des articles visible

---

## 🔄 Prochaines étapes si tout fonctionne

1. **Réduire le niveau de logs** une fois le RAG validé
2. **Ajuster les seuils** de similarité selon les résultats
3. **Importer plus d'articles** du Code civil
4. **Ajouter d'autres codes** (Code pénal, Code du travail, etc.)
5. **Optimiser les prompts** selon les retours utilisateurs

---

## 📝 Résumé des fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `app/api/chat/route.ts` | Ajout de logs détaillés du processus RAG (lignes 100-176) |
| `lib/rag.ts` | Ajout de logs dans toutes les fonctions de recherche |
| `lib/rag.ts` | Prompt système renforcé avec instructions strictes |
| `scripts/test-rag.ts` | **NOUVEAU** - Script de test automatisé du RAG |

Les fichiers suivants étaient **déjà corrects** :
- ✅ `supabase/migrations/add_vector_extension.sql`
- ✅ `supabase/migrations/fix_search_functions_add_legifrance_id.sql`
- ✅ `scripts/import-and-embed.ts`
- ✅ `components/chat/SourceCard.tsx`
- ✅ `app/chat/page.tsx`

---

**Date** : 27 octobre 2025
**Version** : 2.0.0
