# 🚀 Guide de démarrage rapide - Import universel

## 📦 Scripts créés

Vous disposez maintenant de 4 scripts complets :

| Script | Description | Usage |
|--------|-------------|-------|
| **check-setup.ts** | Vérifie que tout est prêt | `npx tsx scripts/check-setup.ts` |
| **import-all-codes.ts** | Importe tous les codes | `npx tsx scripts/import-all-codes.ts` |
| **check-import-progress.ts** | Vérifie la progression | `npx tsx scripts/check-import-progress.ts` |
| **reset-import.ts** | Réinitialise l'import | `npx tsx scripts/reset-import.ts` |

---

## ⚡ Workflow recommandé

### 1️⃣ Vérifier la configuration (OBLIGATOIRE)

```bash
npx tsx scripts/check-setup.ts
```

**Nouveau :** Test rapide de l'API Légifrance (PISTE)

```bash
npx tsx scripts/test-legifrance-api.ts
```

Ce script teste l'authentification OAuth et un appel API réel.

**Ce script vérifie :**
- ✅ Variables d'environnement (.env.local)
- ✅ Tables Supabase (legal_codes, legal_articles)
- ✅ Extension pgvector
- ✅ Connexion API Légifrance (PISTE)
- ✅ Connexion API Mistral
- ✅ Présence des codes dans legal_codes

**Sortie attendue :**
```
✅ Tous les prérequis sont remplis ! 🎉

💡 Vous pouvez lancer l'import :
   npx tsx scripts/import-all-codes.ts
```

---

### 2️⃣ Lancer l'import complet

```bash
npx tsx scripts/import-all-codes.ts
```

**Durée estimée : 2h30 à 4h30** (laisser tourner en arrière-plan)

**Le script :**
1. Récupère les 6 codes depuis `legal_codes`
2. Authentifie via OAuth PISTE
3. Récupère tous les articles de chaque code
4. Insère dans `legal_articles` (UPSERT)
5. Génère les embeddings Mistral (1024 dim)
6. Affiche les statistiques finales

**Vous pouvez l'interrompre (Ctrl+C) et le relancer** : il reprendra où il s'est arrêté.

---

### 3️⃣ Vérifier la progression

```bash
npx tsx scripts/check-import-progress.ts
```

**Affiche :**
- 📊 Statistiques globales (total, pourcentage)
- 📖 Répartition par code
- ⚠️ Articles sans embeddings
- 💡 Recommandations

---

## 🔧 Commandes utiles

### Réinitialiser uniquement les embeddings

```bash
npx tsx scripts/reset-import.ts --embeddings-only
```

Utile si vous voulez régénérer les embeddings sans réimporter les articles.

### Réinitialiser un code spécifique

```bash
npx tsx scripts/reset-import.ts --code="Code Civil"
```

Supprime uniquement les articles du Code Civil.

### Réinitialisation complète (⚠️ DANGEREUX)

```bash
npx tsx scripts/reset-import.ts
```

Supprime TOUS les articles de TOUS les codes. Demande confirmation.

### Réinitialisation sans confirmation

```bash
npx tsx scripts/reset-import.ts --confirm
```

⚠️ **Utiliser uniquement dans des scripts automatisés**

---

## 📊 Statistiques attendues

Après import complet :

| Code | Articles estimés |
|------|------------------|
| Code Civil | ~2 500 |
| Code Pénal | ~800 |
| Code du Travail | ~7 000 |
| Code de Commerce | ~900 |
| Code de Procédure Civile | ~1 500 |
| Code de Procédure Pénale | ~900 |
| **TOTAL** | **~13 000 articles** |

---

## ⚠️ En cas d'erreur

### Erreur 429 (Too Many Requests) - Mistral

```bash
# Éditer scripts/import-all-codes.ts
# Ligne 20 : Augmenter EMBEDDING_DELAY
const EMBEDDING_DELAY = 5000; // 5 secondes au lieu de 2
```

### Erreur 429 - Légifrance PISTE

```bash
# Éditer scripts/import-all-codes.ts
# Ligne 21 : Augmenter REQUEST_DELAY
const REQUEST_DELAY = 2000; // 2 secondes au lieu de 0.5
```

### Connexion perdue / Script interrompu

```bash
# Relancer simplement le script
npx tsx scripts/import-all-codes.ts
# Il reprendra automatiquement
```

### Articles manquants après import

```bash
# Vérifier d'abord
npx tsx scripts/check-import-progress.ts

# Puis relancer l'import
npx tsx scripts/import-all-codes.ts
```

---

## 🎯 Exemple de session complète

```bash
# 1. Vérifier la config
npx tsx scripts/check-setup.ts
# ✅ Tous les prérequis sont remplis !

# 2. Lancer l'import (laisser tourner 3-4h)
npx tsx scripts/import-all-codes.ts
# ... Import en cours ...
# 🎉 IMPORTATION TERMINÉE AVEC SUCCÈS !

# 3. Vérifier le résultat
npx tsx scripts/check-import-progress.ts
# 📊 Total d'articles : 13,215
# ✅ Avec embeddings : 13,215
# 📈 Progression globale : 100.00%

# 4. Tester le RAG
npx tsx scripts/test-new-rag.ts
# (si ce script existe)
```

---

## 📝 Checklist finale

Avant de lancer l'import, vérifiez :

- [ ] `.env.local` contient toutes les clés API
- [ ] Migrations Supabase exécutées (legal_codes, legal_articles)
- [ ] Extension pgvector activée
- [ ] Table legal_codes contient les 6 codes
- [ ] Connexion Légifrance PISTE OK
- [ ] Connexion Mistral AI OK

**Si tous les points sont cochés** ✅ :

```bash
npx tsx scripts/import-all-codes.ts
```

**Ensuite, allez prendre un café** ☕ (ou plusieurs 😄)

---

## 🆘 Besoin d'aide ?

Consultez la documentation complète :

```
scripts/README-IMPORT-UNIVERSAL.md
```

Ou vérifiez les logs détaillés des scripts pour identifier l'erreur.

---

**C'est tout ! Bon import ! 🚀**
