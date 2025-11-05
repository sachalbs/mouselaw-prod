# Guide d'import du Code civil depuis Légifrance

Ce guide explique comment importer l'intégralité du Code civil français depuis l'API Légifrance (PISTE) dans votre base de données Mouse Law.

## Vue d'ensemble

L'API Légifrance PISTE permet d'accéder à tous les textes juridiques français de manière programmatique. Ce guide vous montre comment :

1. Obtenir vos credentials API
2. Importer tous les articles du Code civil (~2500 articles)
3. Générer les embeddings pour la recherche vectorielle
4. Estimer les coûts et le temps nécessaire

## Étape 1 : Obtenir les credentials API Légifrance

### Créer un compte PISTE

1. Allez sur **https://piste.gouv.fr**
2. Cliquez sur **"S'inscrire"** ou **"Créer un compte"**
3. Remplissez le formulaire d'inscription
4. Validez votre email

### Créer une application

1. Une fois connecté, allez dans **"Mes applications"**
2. Cliquez sur **"Créer une application"**
3. Remplissez les informations :
   - **Nom** : Mouse Law
   - **Description** : Plateforme d'assistance juridique pour étudiants en droit
   - **URL de redirection** : http://localhost:3000 (pour le développement)
   - **API** : Sélectionnez "Légifrance Beta"

4. Validez la création

### Récupérer les credentials

Une fois l'application créée, vous obtenez :
- **Client ID** : Identifiant de votre application
- **Client Secret** : Clé secrète (à garder confidentielle !)

**Important :** Ne partagez jamais votre `client_secret` publiquement.

### Configurer Mouse Law

Ajoutez vos credentials dans `.env.local` :

```bash
LEGIFRANCE_CLIENT_ID=votre_client_id_ici
LEGIFRANCE_CLIENT_SECRET=votre_client_secret_ici
```

## Étape 2 : Tester la connexion

Avant d'importer tous les articles, testez que tout fonctionne :

```bash
# Démarrez le serveur Next.js
npm run dev

# Dans un autre terminal, testez la connexion
curl -X POST "http://localhost:3000/api/import-legifrance?test=true"
```

Réponse attendue :
```json
{
  "success": true,
  "message": "Successfully connected to Légifrance API"
}
```

Si vous obtenez une erreur, vérifiez :
- Que vos credentials sont corrects
- Que vous avez bien activé l'API Légifrance Beta dans PISTE
- Que votre compte est validé

## Étape 3 : Importer le Code civil

### Option A : Script automatique (recommandé)

Le script `import-and-embed.ts` fait tout le travail :

```bash
# Installation de tsx (si pas déjà installé)
npm install -D tsx

# Lancer le script d'import complet
npx tsx scripts/import-and-embed.ts
```

Ce script va :
1. Se connecter à l'API Légifrance
2. Récupérer tous les articles du Code civil
3. Les insérer dans la base de données
4. Générer les embeddings pour chaque article
5. Afficher la progression et les statistiques

### Option B : Import manuel (étape par étape)

#### 1. Importer les articles

```bash
curl -X POST "http://localhost:3000/api/import-legifrance"
```

Réponse attendue :
```json
{
  "message": "Successfully imported X articles from Code civil",
  "total_fetched": 2564,
  "imported": 2564,
  "skipped": 0,
  "failed": 0,
  "needs_embedding": 2564
}
```

#### 2. Générer les embeddings

```bash
curl -X POST "http://localhost:3000/api/embed-articles"
```

Réponse attendue :
```json
{
  "message": "Successfully generated embeddings for all articles",
  "processed": 2564
}
```

### Options avancées

**Remplacer les articles existants :**
```bash
npx tsx scripts/import-and-embed.ts --replace
```

**Test uniquement (pas d'import) :**
```bash
npx tsx scripts/import-and-embed.ts --test
```

## Estimations de temps et coût

### Temps de traitement

| Étape | Articles | Temps estimé |
|-------|----------|--------------|
| Import Légifrance | ~2500 | 2-5 minutes |
| Génération embeddings | ~2500 | 30-50 minutes |
| **Total** | | **35-55 minutes** |

### Coût API Mistral

L'API Mistral Embed facture par tokens :

- **Prix** : ~0.10€ / 1M tokens
- **Tokens par article** : ~200-300 tokens en moyenne
- **Total tokens** : ~500K-750K tokens
- **Coût estimé** : ~0.05€ - 0.08€

**Coût total : < 0.10€** pour l'import complet du Code civil 🎉

### API Légifrance

L'API Légifrance PISTE est **gratuite** pour un usage raisonnable (rate limit : 100 req/min).

## Structure des articles importés

Chaque article importé contient :

```typescript
{
  article_number: "1240",
  content: "Tout fait quelconque de l'homme...",
  title: "Responsabilité du fait personnel",
  category: "Livre III : Des différentes manières...",
  book: "Livre III",
  chapter: "Chapitre II",
  code_name: "Code civil",
  keywords: ["responsabilité", "dommage", "faute", ...]
}
```

## Vérification de l'import

### Vérifier le nombre d'articles

```bash
# Via l'API
curl "http://localhost:3000/api/import-legifrance"
```

Réponse :
```json
{
  "total_articles": 2564,
  "articles_with_embeddings": 2564,
  "articles_without_embeddings": 0,
  "api_configured": true,
  "ready_to_import": true
}
```

### Vérifier dans Supabase

Dans le dashboard Supabase, exécutez :

```sql
-- Compter les articles
SELECT COUNT(*) FROM code_civil_articles;

-- Compter les articles avec embeddings
SELECT COUNT(*) FROM code_civil_articles WHERE embedding IS NOT NULL;

-- Voir les premiers articles
SELECT article_number, title, category
FROM code_civil_articles
ORDER BY article_number
LIMIT 10;
```

### Tester la recherche

Posez une question à Mouse pour vérifier que la recherche fonctionne :

> "Explique-moi la responsabilité civile"

Mouse devrait maintenant citer des articles réels du Code civil !

## Dépannage

### Erreur "OAuth error"

**Problème :** Les credentials sont incorrects ou l'application n'est pas validée.

**Solution :**
- Vérifiez vos `LEGIFRANCE_CLIENT_ID` et `LEGIFRANCE_CLIENT_SECRET`
- Assurez-vous que l'application est active dans PISTE
- Vérifiez que l'API Légifrance Beta est bien activée

### Erreur "Rate limit exceeded"

**Problème :** Trop de requêtes en peu de temps.

**Solution :**
- Le script gère automatiquement le rate limiting
- Attendez quelques minutes avant de réessayer
- L'API PISTE a une limite de 100 requêtes/minute

### Articles non trouvés

**Problème :** L'API retourne 0 articles.

**Solution :**
- Vérifiez que le Code civil ID est correct : `LEGITEXT000006070721`
- Vérifiez que l'API est accessible : `curl https://api.piste.gouv.fr`
- Consultez les logs du serveur pour plus de détails

### Embeddings échouent

**Problème :** Les embeddings ne se génèrent pas.

**Solution :**
- Vérifiez votre `MISTRAL_API_KEY`
- Vérifiez que vous avez du crédit sur votre compte Mistral
- Les embeddings sont générés par batch de 10 avec retry automatique

### Timeout pendant l'import

**Problème :** L'import prend trop de temps et timeout.

**Solution :**
- Utilisez le script CLI : `npx tsx scripts/import-and-embed.ts`
- Le script n'a pas de timeout et affiche la progression
- L'API route a un timeout de 5 minutes par défaut

## Mise à jour du Code civil

Le Code civil est mis à jour régulièrement. Pour importer les nouvelles versions :

```bash
# Remplacer tous les articles
npx tsx scripts/import-and-embed.ts --replace
```

**Note :** Cela va remplacer tous les articles existants et régénérer tous les embeddings (~50 minutes + 0.10€).

## Ajout d'autres codes juridiques

Le système est conçu pour supporter d'autres codes. Pour ajouter le Code pénal, Code du travail, etc. :

1. Trouvez le `textId` du code sur Légifrance
2. Modifiez `lib/legifrance/client.ts` avec le nouveau `textId`
3. Lancez l'import
4. Mettez à jour la colonne `code_name` pour différencier les codes

Exemple de `textId` :
- **Code civil** : `LEGITEXT000006070721`
- **Code pénal** : `LEGITEXT000006070719`
- **Code du travail** : `LEGITEXT000006072050`
- **Code de commerce** : `LEGITEXT000005634379`

## Monitoring

### Logs du serveur

```bash
# Surveiller les logs pendant l'import
npm run dev
```

Les logs montrent :
- La progression de l'import
- Les articles importés
- Les erreurs éventuelles
- Le temps de traitement

### Dashboard Supabase

Dans le dashboard Supabase :
- **Database** > **Tables** > `code_civil_articles`
- Consultez le nombre de lignes
- Vérifiez la colonne `embedding` (ne doit pas être NULL)

## Bonnes pratiques

1. **Backup** : Avant de remplacer les articles, faites un backup de votre base
2. **Test** : Testez d'abord avec `--test` avant l'import complet
3. **Credentials** : Ne commitez JAMAIS vos credentials dans Git
4. **Rate limiting** : Respectez les limites de l'API (le script le fait automatiquement)
5. **Logs** : Gardez les logs d'import pour déboguer si besoin

## Support

Pour obtenir de l'aide :

- **API Légifrance** : https://piste.gouv.fr/documentation
- **API Mistral** : https://docs.mistral.ai
- **Supabase** : https://supabase.com/docs

## Prochaines étapes

Une fois l'import terminé :

1. ✅ Testez la recherche dans Mouse Law
2. ✅ Vérifiez que les citations sont précises
3. ✅ Ajustez les seuils de similarité si nécessaire
4. 🔜 Ajoutez d'autres codes juridiques
5. 🔜 Ajoutez de la jurisprudence
6. 🔜 Mettez en place une synchronisation automatique

**Félicitations !** Mouse Law a maintenant accès à l'intégralité du Code civil français. 🎉
