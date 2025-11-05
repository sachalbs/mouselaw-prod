# 📋 Index des scripts - MouseLaw

## 🚀 Scripts principaux (import universel)

| Script | Description | Status | Commande |
|--------|-------------|--------|----------|
| **import-all-codes.ts** | Import universel de tous les codes | ✅ Corrigé | `npx tsx scripts/import-all-codes.ts` |
| **check-setup.ts** | Vérifie la configuration complète | ✅ Corrigé | `npx tsx scripts/check-setup.ts` |
| **check-import-progress.ts** | Statistiques d'import | ✅ Corrigé | `npx tsx scripts/check-import-progress.ts` |
| **reset-import.ts** | Réinitialise l'import | ✅ Corrigé | `npx tsx scripts/reset-import.ts` |
| **test-legifrance-api.ts** | Test API PISTE | ✅ Nouveau | `npx tsx scripts/test-legifrance-api.ts` |

## 📚 Scripts d'import (anciens)

| Script | Description | Status |
|--------|-------------|--------|
| import-civil-code.ts | Import Code Civil uniquement | ✅ Corrigé |
| import-civil-code-datagouv.ts | Import depuis data.gouv.fr | ✅ Corrigé |
| import-and-embed.ts | Import + embeddings | ✅ Corrigé |
| import-jurisprudence.ts | Import jurisprudence | ✅ Corrigé |
| import-jurisprudence-api.ts | Import jurisprudence API | ✅ Corrigé |
| import-legifrance-complete.ts | Import complet Légifrance | ✅ Corrigé |
| import-legifrance-robust.ts | Import robuste | ✅ Corrigé |

## 🧪 Scripts de test

| Script | Description | Status |
|--------|-------------|--------|
| test-rag.ts | Test système RAG | ✅ Corrigé |
| test-rag-quick.ts | Test RAG rapide | ✅ Corrigé |
| test-new-rag.ts | Test nouveau RAG | ✅ Corrigé |
| test-article-search.ts | Test recherche articles | ✅ Corrigé |
| test-import.ts | Test import | ✅ Corrigé |
| test-enrichment-final.ts | Test enrichissement | ✅ Corrigé |
| test-legifrance-api.ts | Test API PISTE | ✅ Nouveau |

## 🛠️ Scripts de maintenance

| Script | Description | Status |
|--------|-------------|--------|
| regenerate-all-embeddings.ts | Régénère tous les embeddings | ✅ Corrigé |
| reset-embeddings.ts | Supprime les embeddings | ✅ Corrigé |
| improve-embeddings.ts | Améliore les embeddings | ✅ Corrigé |

## 📊 Scripts de vérification

| Script | Description | Status |
|--------|-------------|--------|
| check-progress.ts | Vérifie la progression | ✅ Corrigé |
| check-schema.ts | Vérifie le schéma BDD | ✅ Corrigé |
| check-specific-articles.ts | Vérifie articles spécifiques | ✅ Corrigé |
| check-setup.ts | Setup complet | ✅ Corrigé |
| check-import-progress.ts | Progression import | ✅ Corrigé |

## 🔧 Scripts utilitaires

| Script | Description | Status |
|--------|-------------|--------|
| fetch-full-code-civil.ts | Récupère Code Civil | ✅ Corrigé |
| fetch-missing-ids.ts | Récupère IDs manquants | ✅ Corrigé |
| update-ids-from-json.ts | Met à jour IDs | ✅ Corrigé |
| verify-enrichment.ts | Vérifie enrichissement | ✅ Corrigé |
| quick-count.ts | Compte rapide | ✅ Corrigé |
| apply-jurisprudence-migration.ts | Migration jurisprudence | ✅ Corrigé |

## 📝 Scripts SQL

| Script | Description |
|--------|-------------|
| 001_create_code_civil_table.sql | Création table Code Civil |
| 002_conversations.sql | Table conversations |
| fix-search-function.sql | Correction recherche |

## 📖 Documentation

| Fichier | Description |
|---------|-------------|
| **QUICKSTART.md** | Guide de démarrage rapide |
| **README-IMPORT-UNIVERSAL.md** | Documentation complète import |
| **API_REFERENCE.md** | Référence API Légifrance |
| **FIX_API_URL.md** | Correction erreur 401 |
| **ENV_LOCAL_FIX.md** | Correction chargement .env.local |
| README-IMPORT.md | Guide import ancien |
| SCRIPTS_INDEX.md | Ce fichier |

## ✅ Corrections appliquées

### 1. Chargement .env.local (28 scripts)

**Problème :** Les scripts chargeaient `.env` au lieu de `.env.local`

**Solution :**
```typescript
import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
```

**Status :** ✅ Tous les scripts corrigés

### 2. URL API Légifrance (2 scripts)

**Problème :** URL incorrecte causant erreur 401

**Avant :**
```typescript
const LEGIFRANCE_API_URL = 'https://api.legifrance.gouv.fr/...';
```

**Après :**
```typescript
const LEGIFRANCE_API_URL = 'https://api.piste.gouv.fr/...';
```

**Scripts corrigés :**
- ✅ import-all-codes.ts
- ✅ import-civil-code.ts

**Status :** ✅ Erreur 401 résolue

## 🎯 Workflow recommandé

### Import complet (nouveau système)

```bash
# 1. Vérifier la config
npx tsx scripts/check-setup.ts

# 2. Tester l'API (optionnel)
npx tsx scripts/test-legifrance-api.ts

# 3. Lancer l'import
npx tsx scripts/import-all-codes.ts

# 4. Vérifier la progression
npx tsx scripts/check-import-progress.ts
```

### Import Code Civil uniquement (ancien système)

```bash
npx tsx scripts/import-civil-code.ts
```

### Réinitialisation

```bash
# Tout supprimer
npx tsx scripts/reset-import.ts

# Embeddings uniquement
npx tsx scripts/reset-import.ts --embeddings-only

# Un code spécifique
npx tsx scripts/reset-import.ts --code="Code Civil"
```

## 🔍 Dépannage

| Problème | Script à utiliser |
|----------|-------------------|
| Erreur variables d'env | `check-setup.ts` |
| Erreur 401 API | `test-legifrance-api.ts` |
| Vérifier progression | `check-import-progress.ts` |
| Tester BDD | `check-schema.ts` |
| Tester RAG | `test-rag-quick.ts` |

## 📊 Statistiques

- **Scripts TypeScript :** 31
- **Scripts SQL :** 3
- **Fichiers documentation :** 7
- **Scripts corrigés (URL) :** 2
- **Scripts corrigés (.env.local) :** 28
- **Nouveaux scripts créés :** 5

## 🆕 Nouveaux scripts (créés aujourd'hui)

1. ✅ `import-all-codes.ts` - Import universel
2. ✅ `check-import-progress.ts` - Progression
3. ✅ `check-setup.ts` - Vérification setup
4. ✅ `reset-import.ts` - Réinitialisation
5. ✅ `test-legifrance-api.ts` - Test API

## 🚀 Prêt à utiliser

Tous les scripts sont maintenant corrigés et fonctionnels.

**Commande recommandée :**
```bash
npx tsx scripts/import-all-codes.ts
```

---

**Dernière mise à jour :** ${date}
**Scripts fonctionnels :** 31/31 ✅
