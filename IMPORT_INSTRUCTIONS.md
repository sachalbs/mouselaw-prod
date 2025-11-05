# Instructions d'import rapide - Mouse Law

Ce guide vous permet d'importer rapidement l'intégralité du Code civil français dans Mouse Law.

## 📋 Prérequis

1. **Credentials Légifrance PISTE** (gratuit)
   - Créez un compte sur https://piste.gouv.fr
   - Créez une application "Mouse Law"
   - Obtenez votre `CLIENT_ID` et `CLIENT_SECRET`

2. **Clé API Mistral** (pour les embeddings)
   - Déjà configurée dans `.env.local`

3. **Base de données Supabase**
   - Migration pgvector déjà appliquée

## 🚀 Import en 3 étapes

### 1. Configurer les credentials

Éditez `.env.local` et ajoutez :

```bash
LEGIFRANCE_CLIENT_ID=votre_client_id
LEGIFRANCE_CLIENT_SECRET=votre_secret
```

### 2. Installer les dépendances

```bash
npm install
npm install -D tsx dotenv
```

### 3. Lancer l'import

```bash
# Import complet (articles + embeddings)
npx tsx scripts/import-and-embed.ts
```

C'est tout ! ✨

## ⏱️ Temps et coût

- **Durée** : 35-55 minutes
- **Coût** : ~0.10€ (API Mistral)
- **Articles** : ~2500 du Code civil
- **API Légifrance** : Gratuit

## ✅ Vérification

Une fois terminé, testez dans Mouse Law :

> "Explique-moi l'article 1240 du Code civil"

Mouse devrait citer l'article exact de la base de données ! 🎯

## 📚 Documentation complète

Pour plus de détails, consultez :
- **LEGIFRANCE_SETUP.md** - Guide complet d'obtention des credentials
- **RAG_SETUP.md** - Comprendre le système RAG vectoriel

## 🔧 Commandes utiles

```bash
# Tester la connexion Légifrance
npx tsx scripts/import-and-embed.ts --test

# Remplacer les articles existants
npx tsx scripts/import-and-embed.ts --replace

# Vérifier le statut
curl http://localhost:3000/api/embed-articles

# Import manuel via API
curl -X POST http://localhost:3000/api/import-legifrance
curl -X POST http://localhost:3000/api/embed-articles
```

## ⚠️ Dépannage rapide

**Erreur OAuth :**
→ Vérifiez vos credentials dans `.env.local`

**Timeout :**
→ Utilisez le script CLI au lieu de l'API route

**Pas d'articles trouvés :**
→ Vérifiez que vous avez activé l'API Légifrance Beta dans PISTE

## 🎉 C'est parti !

```bash
npx tsx scripts/import-and-embed.ts
```

Et attendez 35-55 minutes. Le script affiche la progression en temps réel.
