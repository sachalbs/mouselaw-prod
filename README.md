# MouseLaw

Assistant juridique intelligent expert en droit civil français.

MouseLaw utilise l'IA pour répondre aux questions juridiques en se basant sur une base de données complète du Code civil français, de jurisprudence et de méthodologies pédagogiques.

## Fonctionnalités

- **RAG (Retrieval-Augmented Generation)** : Recherche sémantique dans le Code civil et la jurisprudence
- **Citations précises** : Toutes les réponses citent les articles de loi et décisions de justice pertinentes
- **Liens vers Légifrance** : Accès direct aux textes officiels
- **Historique de conversations** : Sauvegarde automatique de vos échanges
- **Authentification sécurisée** : Système d'authentification via Supabase

## Base de données juridique

- **2,831 articles** du Code civil
- **1,017 décisions** de jurisprudence
- **17 méthodologies** pédagogiques

## Stack technique

- **Frontend**: Next.js 15, React 19, TailwindCSS
- **Backend**: Next.js API Routes, Supabase
- **IA**: Mistral AI (open-mistral-7b) avec embeddings
- **Base de données**: PostgreSQL (Supabase) + pgvector
- **Authentification**: Supabase Auth
- **Déploiement**: Vercel

## Prérequis

- Node.js 18+
- Compte [Supabase](https://supabase.com)
- Clé API [Mistral AI](https://console.mistral.ai)

## Installation

### 1. Cloner le repository

```bash
git clone https://github.com/votre-username/mouselaw.git
cd mouselaw
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env.local
```

Remplir les valeurs dans `.env.local` :

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-clé-publique
SUPABASE_SERVICE_ROLE_KEY=votre-clé-service-role

# Mistral AI
MISTRAL_API_KEY=votre-clé-mistral

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### 4. Vérifier la configuration

```bash
npm run check-env
```

### 5. Lancer le serveur de développement

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Déploiement sur Vercel

### 1. Push sur GitHub

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2. Importer sur Vercel

1. Aller sur [vercel.com](https://vercel.com)
2. Cliquer sur "New Project"
3. Importer votre repository GitHub
4. Configurer les variables d'environnement (identiques à `.env.local`)
5. Cliquer sur "Deploy"

## Scripts disponibles

```bash
# Développement
npm run dev

# Build de production (avec vérification des variables d'env)
npm run build

# Lancer le serveur de production
npm start

# Vérifier les variables d'environnement
npm run check-env

# Linter
npm run lint
```

## Architecture

```
app/
├── api/chat/          # API de chat avec Mistral
├── chat/              # Interface de chat
├── auth/              # Pages d'authentification
lib/
├── rag.ts            # Système RAG (recherche sémantique)
├── logger.ts         # Logger pour production
├── rateLimit.ts      # Protection rate limiting
├── supabase/         # Clients Supabase
components/
├── chat/             # Composants UI du chat
├── auth/             # Composants d'authentification
```

## Sécurité

- **Authentification obligatoire** : Toutes les routes API sont protégées
- **RLS (Row Level Security)** : Politiques de sécurité au niveau base de données
- **Rate limiting** : 30 requêtes par minute par utilisateur
- **Variables d'environnement** : Secrets jamais exposés au client
- **Validation des entrées** : Sanitisation de toutes les entrées utilisateur

## Licence

MIT

## Support

Pour toute question ou problème, ouvrir une issue sur GitHub.
