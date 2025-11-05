# 📚 Intégration des Méthodologies Pédagogiques dans MouseLaw

## 🎯 Vue d'ensemble

MouseLaw intègre désormais des **méthodologies juridiques pédagogiques** pour aider les étudiants en droit à maîtriser les exercices juridiques (commentaires d'arrêt, cas pratiques, dissertations, etc.).

Cette fonctionnalité utilise le même système RAG (Retrieval-Augmented Generation) que pour les articles et la jurisprudence, avec des embeddings vectoriels pour une recherche sémantique intelligente.

## 🏗️ Architecture Technique

### Table `methodology_resources`

```sql
CREATE TABLE methodology_resources (
  id UUID PRIMARY KEY,

  -- Classification
  type TEXT,              -- methodology, template, tip, checklist, example
  category TEXT,          -- commentaire_arret, cas_pratique, dissertation, etc.
  subcategory TEXT,       -- introduction, developpement, erreurs, notation

  -- Contenu
  title TEXT,
  content TEXT,
  keywords TEXT[],

  -- Métadonnées pédagogiques
  level TEXT,             -- L1, L2, L3, M1, M2, CRFPA, Tous
  duration_minutes INTEGER,
  points_notation INTEGER,

  -- Liens
  related_legal_concepts TEXT[],
  example_cases TEXT[],

  -- RAG
  embedding VECTOR(1024),

  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Flux RAG avec Méthodologies

```
Question utilisateur
    ↓
Génération embedding (Mistral Embed)
    ↓
Recherche parallèle :
├─ Articles juridiques (threshold: 0.75)
├─ Jurisprudence (threshold: 0.50)
└─ Méthodologies (threshold: 0.65)
    ↓
Formatage contexte avec mode pédagogique si méthodologies trouvées
    ↓
Prompt enrichi → Mistral LLM
    ↓
Réponse structurée et pédagogique
```

## 📝 Format des Données

### Structure JSON des méthodologies

```json
{
  "type": "methodology",
  "category": "commentaire_arret",
  "subcategory": "introduction",
  "title": "Comment rédiger l'introduction d'un commentaire d'arrêt",
  "content": "L'introduction d'un commentaire d'arrêt comporte 4 parties obligatoires...",
  "keywords": ["introduction", "accroche", "intérêt", "problématique", "plan"],
  "level": "L2",
  "duration_minutes": 30,
  "points_notation": 4,
  "related_legal_concepts": ["responsabilité civile", "article 1240"],
  "example_cases": ["Civ. 1re, 1er décembre 1964, n° 62-13.164"]
}
```

### Types disponibles

- **methodology** : Méthode complète (ex: "Comment faire un commentaire d'arrêt")
- **template** : Gabarit/modèle à suivre (ex: "Plan type du cas pratique")
- **tip** : Conseil pratique (ex: "Les erreurs fréquentes à éviter")
- **checklist** : Liste de vérification (ex: "Points à vérifier avant de rendre sa copie")
- **example** : Exemple concret (ex: "Exemple de commentaire réussi")

### Catégories disponibles

- **commentaire_arret** : Commentaire d'arrêt de la Cour de cassation ou du Conseil d'État
- **cas_pratique** : Résolution de cas pratique avec syllogisme juridique
- **dissertation** : Dissertation juridique (problématique, plan en 2 parties)
- **fiche_arret** : Fiche de jurisprudence (faits, procédure, problème, solution)
- **note_synthese** : Note de synthèse (synthèse de documents)

## 🚀 Utilisation

### Import des méthodologies

```bash
# 1. Appliquer la migration SQL (via Supabase Dashboard)
# Copier-coller le contenu de supabase/migrations/create_methodology_resources.sql

# 2. Remplir data/methodologies.json avec les méthodologies

# 3. Importer les méthodologies
npx tsx scripts/import-methodologies.ts

# 4. Vérifier l'import
# Via SQL Editor Supabase :
SELECT COUNT(*), category FROM methodology_resources GROUP BY category;
```

### Exemples de questions supportées

Les méthodologies sont automatiquement recherchées et intégrées au contexte quand l'utilisateur pose des questions pédagogiques :

- "Comment faire un commentaire d'arrêt ?"
- "Donne-moi le gabarit d'introduction pour un commentaire"
- "Quelle est la structure d'un cas pratique ?"
- "Comment traiter un problème de droit ?"
- "Quelles sont les erreurs fréquentes en dissertation ?"
- "Comment rédiger un plan de commentaire ?"
- "Montre-moi un exemple de syllogisme juridique"
- "Comment structurer une fiche d'arrêt ?"

### Mode Pédagogique Automatique

Quand des méthodologies sont trouvées, MouseLaw active automatiquement le **Mode Pédagogique** avec :

✅ Instructions pédagogiques spécifiques au LLM
✅ Méthodologies affichées AVANT les articles
✅ Emphasis sur la structure et les exemples
✅ Conseils pratiques et alertes sur les erreurs
✅ Progression didactique

## 📊 Statistiques et Monitoring

Les méthodologies utilisées sont trackées dans la réponse API :

```json
{
  "response": "...",
  "articlesUsed": 2,
  "jurisprudenceUsed": 3,
  "methodologiesUsed": 1
}
```

Logs de recherche :
```
📚 METHODOLOGY SEARCH
   • Limit: 3
   • Threshold: 0.65
   ✅ Retrieved 17 methodologies with embeddings
   ✅ Filtered to 2 methodologies above threshold (≥0.65)

📋 Top methodology results:
   1. commentaire_arret - methodology - 87.34%
      Comment rédiger l'introduction d'un commentaire
```

## 🔧 Ajout de Nouvelles Méthodologies

### 1. Éditer `data/methodologies.json`

```json
{
  "type": "tip",
  "category": "cas_pratique",
  "subcategory": "qualification",
  "title": "Les 5 erreurs fréquentes en qualification juridique",
  "content": "1. Confondre obligation de moyens et de résultat...",
  "keywords": ["qualification", "erreurs", "obligations", "contrat"],
  "level": "L2"
}
```

### 2. Réimporter

```bash
npx tsx scripts/import-methodologies.ts
```

Le script détecte automatiquement les doublons (par titre) et ne réimporte que les nouvelles méthodologies.

### 3. Tester

Poser une question relative à la méthodologie ajoutée et vérifier qu'elle apparaît dans le contexte.

## 📐 Best Practices

### Rédaction du Contenu

- **Structuré** : Utiliser des sections claires (I., II., A., B., etc.)
- **Progressif** : Commencer simple, puis approfondir
- **Concret** : Donner des exemples et cas d'usage
- **Actionnable** : Fournir des gabarits, templates, checklists
- **Complet** : Couvrir tous les aspects (durée, barème, erreurs)

### Keywords Optimaux

Choisir des mots-clés que les étudiants utiliseraient naturellement :
- ✅ "introduction", "accroche", "problématique", "plan"
- ✅ "syllogisme", "qualification", "majeure", "mineure"
- ❌ Éviter jargon trop technique ou termes rares

### Niveaux

Adapter le contenu au niveau :
- **L1** : Très détaillé, pédagogique, exemples simples
- **L2-L3** : Structure claire, références jurisprudentielles
- **M1-M2** : Approfondi, analyse critique, références doctrinales
- **CRFPA** : Format examen, gestion du temps, conseils pratiques
- **Tous** : Applicable à tous niveaux

## 🔍 Tuning des Seuils de Recherche

Paramètres actuels (dans `app/api/chat/route.ts`) :

```typescript
{
  maxArticles: 3,
  maxJurisprudence: 5,
  maxMethodologies: 3,           // 👈 Nombre max de méthodologies
  articleThreshold: 0.75,
  jurisprudenceThreshold: 0.50,
  methodologyThreshold: 0.65     // 👈 Seuil de similarité
}
```

**Ajustements recommandés** :
- 🔺 **Augmenter threshold (0.70-0.75)** : Méthodologies plus précises, mais moins de résultats
- 🔻 **Baisser threshold (0.55-0.60)** : Plus de méthodologies, mais potentiellement moins pertinentes
- 📈 **Augmenter limite (4-5)** : Plus de contexte pédagogique, mais tokens plus élevés

## 🧪 Tests de Validation

### Test 1 : Import réussi
```bash
npx tsx scripts/import-methodologies.ts --limit=5
# Attendu : 5 méthodologies importées avec succès, embeddings générés
```

### Test 2 : Recherche méthodologie
```sql
SELECT title, category, similarity
FROM methodology_resources,
     plainto_tsquery('french', 'commentaire arrêt introduction') query
WHERE embedding IS NOT NULL
LIMIT 3;
```

### Test 3 : Question pédagogique
Poser dans l'UI : "Comment faire un commentaire d'arrêt ?"

Vérifier dans les logs :
```
📚 METHODOLOGY SEARCH
   ✅ Filtered to X methodologies above threshold

📖 Méthodologies trouvées: X
```

### Test 4 : Mode Pédagogique activé
Vérifier que le prompt contient :
```
╔══════════════════════════════════════════════════════════════════════╗
║   MODE PÉDAGOGIQUE - MÉTHODOLOGIES ET SOURCES JURIDIQUES            ║
╚══════════════════════════════════════════════════════════════════════╝
```

## 🎓 Exemples de Méthodologies à Créer

### Commentaire d'Arrêt
- Structure générale complète (9 sections)
- Introduction (4 parties : accroche, faits, intérêt, annonce)
- Analyse des faits et procédure
- Problématique et thèse
- Plan (2 parties équilibrées)
- Erreurs fréquentes à éviter
- Grille de notation détaillée
- Exemple de commentaire réussi
- Gabarit/template avec phrases types

### Cas Pratique
- Structure générale (8 sections)
- Qualification juridique
- Syllogisme (majeure, mineure, conclusion)
- Traitement des différents problèmes
- Gestion du temps (3h)
- Erreurs méthodologiques courantes
- Barème de notation
- Exemple de cas traité

### Dissertation
- Structure en 2 parties / 2 sous-parties
- Problématisation
- Annonce de plan
- Transitions
- Erreurs à éviter

## 📈 Améliorations Futures

### Court Terme
- [ ] Ajouter 50+ méthodologies couvrant tous les exercices
- [ ] Templates Markdown formatés pour l'UI
- [ ] Filtrage par niveau (L1, L2, etc.) dans les requêtes

### Moyen Terme
- [ ] Méthodologies spécifiques par matière (civil, pénal, administratif)
- [ ] Exemples annotés (copies notées avec commentaires)
- [ ] Quiz et exercices interactifs

### Long Terme
- [ ] Génération automatique de plans personnalisés
- [ ] Correction automatique de copies avec feedback
- [ ] Suggestions de jurisprudence selon la méthodologie

---

**Maintainers** : @MouseLaw Team
**Dernière mise à jour** : 2025-11-03
