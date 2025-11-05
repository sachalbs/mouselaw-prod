# 📚 Guide : Génération des Embeddings Manquants

## 🎯 Objectif

Générer les embeddings Mistral pour tous les articles juridiques qui n'en ont pas encore.

**Situation actuelle** : 1,121 / 2,840 articles du Code Civil ont des embeddings (39.5%)
**Objectif** : 100% des articles avec embeddings

## 🚀 Usage du Script

### Commandes de Base

```bash
# Test avec 5 articles (validation rapide)
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil --limit=5

# Test avec 50 articles
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil --limit=50

# Générer TOUS les embeddings manquants du Code Civil
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil

# Générer tous les embeddings de tous les codes
npx tsx scripts/generate-missing-embeddings.ts
```

### Options

| Option | Description | Exemple |
|--------|-------------|---------|
| `--code=<nom>` | Cibler un code spécifique | `--code=code_civil` |
| `--limit=<nombre>` | Limiter le nombre d'articles | `--limit=100` |

**Codes disponibles** :
- `code_civil` (Code Civil)
- `code_penal` (Code Pénal)
- `code_travail` (Code du Travail)
- `code_commerce` (Code de Commerce)
- `code_procedure_civile` (Code de Procédure Civile)
- `code_procedure_penale` (Code de Procédure Pénale)

## 📊 Affichage en Temps Réel

Pendant l'exécution, le script affiche :

```
[========================================] 45.2%
📊 Progression : 1280/2840 embeddings
⚡ Vitesse : ~28.5 embeddings/min
⏱️  ETA : 45m 23s
✅ Succès : 1278 | ❌ Échecs : 2 | ⚠️  Erreurs 429 : 5
⏸️  Temps total en pause : 2m 15s

🔄 En cours : Article 1542 (code_civil)
   "Les obligations qui naissent d'un contrat sont régies par les dispositions..."
```

## ⚙️ Fonctionnalités

### 1. Gestion Intelligente des Rate Limits

**Stratégie adaptive** :
- Délai initial : **2 secondes** entre chaque requête
- Si erreur 429 : délai **exponentiel** (5s → 10s → 20s → 40s → 60s max)
- Surveillance : compte les requêtes par minute
- Si > 50 requêtes/min : **pause forcée de 60s**

**Exemple de comportement** :
```
✅ Requête réussie → délai maintenu à 2s
⚠️  Erreur 429 → délai augmenté à 4s
⚠️  Erreur 429 → délai augmenté à 8s
✅ Requête réussie → délai réduit progressivement
```

### 2. Reprise Automatique

**Le script peut être interrompu à tout moment** :
- ✅ Skip automatique des articles avec embeddings
- ✅ Reprise là où il s'est arrêté
- ✅ Pas de duplication d'embeddings

**Exemple** :
```bash
# Lancement initial
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil

# Le script traite 500 articles puis crashe...
# Relancez simplement la même commande :
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil

# Il reprendra automatiquement à l'article 501
```

### 3. Checkpoints Automatiques

Toutes les **100 embeddings**, le script sauvegarde un checkpoint :

```
💾 CHECKPOINT : 1200/2840 (42.3%)
```

### 4. Statistiques Finales

À la fin de l'exécution :

```
╔══════════════════════════════════════════════════════════════╗
║   GÉNÉRATION TERMINÉE                                        ║
╚══════════════════════════════════════════════════════════════╝

📊 STATISTIQUES FINALES :
   • Total traité : 1719 articles
   • ✅ Succès : 1715 (99.8%)
   • ❌ Échecs : 4 (0.2%)
   • ⚠️  Erreurs 429 : 12
   • ⏱️  Temps total : 1h 25m
   • ⏸️  Temps en pause : 5m 30s
   • ⚡ Vitesse moyenne : 20.2 embeddings/min

✅ Tous les embeddings ont été générés avec succès !
```

## 🧪 Plan de Test Recommandé

### Phase 1 : Validation (5 articles)
```bash
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil --limit=5
```
**Temps estimé** : ~15 secondes
**Objectif** : Vérifier que tout fonctionne

### Phase 2 : Test de Volume (50 articles)
```bash
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil --limit=50
```
**Temps estimé** : ~2 minutes
**Objectif** : Tester la gestion des rate limits

### Phase 3 : Test de Reprise (interruption)
```bash
# Lancer avec 100 articles
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil --limit=100

# Interrompre avec Ctrl+C après 20 secondes

# Relancer la même commande
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil --limit=100
```
**Objectif** : Vérifier la reprise automatique

### Phase 4 : Production Complète
```bash
# Générer TOUS les embeddings manquants
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil
```
**Temps estimé** : ~1h30 pour 1,719 articles
**Objectif** : Compléter le Code Civil à 100%

## ⚡ Optimisations Appliquées

### 1. Rate Limiting Intelligent
- ✅ Détection préventive du rate limit
- ✅ Adaptation dynamique du délai
- ✅ Retry automatique avec backoff exponentiel

### 2. Performance
- ✅ Requêtes séquentielles (évite le rate limit)
- ✅ Skip des articles déjà traités
- ✅ Mise à jour directe en base (pas de cache)

### 3. Robustesse
- ✅ Gestion des erreurs réseau
- ✅ Gestion des erreurs DB
- ✅ Logs détaillés pour debug
- ✅ Reprise automatique

## 🎯 Temps Estimés

| Scénario | Articles | Temps Estimé | Commande |
|----------|----------|--------------|----------|
| Test rapide | 5 | ~15s | `--limit=5` |
| Test volume | 50 | ~2min | `--limit=50` |
| Batch moyen | 500 | ~20min | `--limit=500` |
| Code Civil complet | ~1,719 | ~1h30 | `--code=code_civil` |
| Tous les codes | ~5,000+ | ~4h+ | (sans options) |

**Note** : Les temps incluent les pauses forcées pour éviter le rate limit.

## 🔧 En Cas de Problème

### Erreur 429 Persistante
```bash
# Le script gère automatiquement les erreurs 429
# Si elles persistent, le délai augmente progressivement
# Aucune action requise, laissez le script gérer
```

### Script Interrompu
```bash
# Relancez simplement la même commande
# Il reprendra automatiquement là où il s'est arrêté
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil
```

### Vérifier la Progression
```sql
-- Compter les embeddings générés
SELECT
  c.display_name,
  COUNT(*) as total,
  COUNT(embedding) as with_embeddings,
  ROUND(100.0 * COUNT(embedding) / COUNT(*), 1) as percentage
FROM legal_articles a
JOIN legal_codes c ON c.id = a.code_id
GROUP BY c.display_name
ORDER BY c.display_name;
```

### Articles Échoués
```bash
# Si des articles échouent, relancez le script
# Il ne traitera que les articles sans embeddings
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil
```

## 📈 Suivi de Progression

Vous pouvez suivre la progression en temps réel dans :
1. **Le terminal** : affichage live de la progression
2. **Supabase** : requête SQL pour voir le % d'embeddings
3. **Logs** : fichier de logs (si configuré)

## 🎉 Résultat Attendu

**Avant** :
```
Code Civil : 1,121 / 2,840 (39.5%) ❌
```

**Après** :
```
Code Civil : 2,840 / 2,840 (100.0%) ✅
```

---

**Prêt à lancer ?**

Commencez par un test rapide :
```bash
npx tsx scripts/generate-missing-embeddings.ts --code=code_civil --limit=5
```
