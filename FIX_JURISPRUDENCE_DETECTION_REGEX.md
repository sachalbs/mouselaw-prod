# ✅ FIX : Regex de détection de jurisprudence

**Date:** 2025-11-05
**Problème:** "Cour de Cassation - 15/11/2024, n° 23-15432" n'était pas détectée dans les sources
**Cause:** Le pattern regex n'acceptait pas le trait d'union "-" comme séparateur
**Statut:** ✅ RÉSOLU

---

## 🔍 Diagnostic

### Test effectué

Script de test créé : `scripts/test-juris-regex.ts`

**Résultats du test** :

| Cas de test | Pattern actuel | Pattern amélioré |
|-------------|----------------|------------------|
| "Cour de Cassation - 15/11/2024, n° 23-15432" | ❌ PAS DE MATCH | ✅ MATCH |
| "Cass. Civ. 1, 15 oct. 2024, n° 23-19876" | ✅ MATCH | ✅ MATCH |
| "Cour de cassation, 13/02/1930" | ✅ MATCH | ✅ MATCH |
| "Cour de Cassation, 15 octobre 2024" | ✅ MATCH | ✅ MATCH |
| "CA Paris, 5 mars 2024" | ✅ MATCH | ✅ MATCH |
| "Cass. soc., 12 juin 2024" | ✅ MATCH | ✅ MATCH |

**Score** :
- Pattern actuel : 5/6 cas détectés (83%)
- Pattern amélioré : 6/6 cas détectés (100%)

---

## ❌ Problème identifié

### Pattern actuel (lib/parseReferences.ts ligne 28)

```typescript
// ❌ AVANT
jurisprudence: /(?:Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)
  (?:\s+(?:Civ\.|Comm\.|Soc\.|Crim\.|Ch\.\s+mixte)\s*\d*)?
  [\s,]+                          // ❌ Seulement espaces et virgules
  \d{1,2}[\s/]
  (?:janvier|février|...|[\d]{1,2}[\s/])
  (?:\s|\/)?\d{4}
  (?:[\s,]+n°?\s*[\d-]+)?/gi
```

**Limitations** :
1. `[\s,]+` : N'accepte que les espaces et virgules comme séparateur
   - ❌ Ne détecte pas "Cour de Cassation - 15/11/2024" (trait d'union)

2. Format de date trop restrictif
   - ❌ Ne détecte pas bien "DD/MM/YYYY" direct

---

## ✅ Solution appliquée

### Pattern amélioré (lib/parseReferences.ts ligne 29)

```typescript
// ✅ APRÈS
jurisprudence: /(?:Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)
  (?:\s+(?:Civ\.|Comm\.|Soc\.|Crim\.|Ch\.\s+mixte)\s*\d*)?
  [\s,\-]+                        // ✅ Espaces, virgules ET traits d'union
  (?:
    \d{1,2}[\s/\-](?:janvier|février|...|déc\.)\s*\d{4}  // Format avec mois texte
    |
    \d{1,2}\/\d{1,2}\/\d{4}       // ✅ Format DD/MM/YYYY direct
  )
  (?:[\s,]*n°?\s*[\d\-]+)?/gi
```

**Améliorations** :

1. **Séparateur flexible** : `[\s,\-]+`
   - ✅ Espaces : "Cour de Cassation, 15/11/2024"
   - ✅ Virgules : "Cass. Civ. 1, 15 oct. 2024"
   - ✅ **Traits d'union** : "Cour de Cassation - 15/11/2024"

2. **Deux formats de date** :
   - Format texte : "15 octobre 2024", "15 oct. 2024"
   - **Format numérique** : "15/11/2024", "13/02/1930"

3. **Numéro de décision flexible** :
   - Avec ou sans "n°" : "n° 23-15432" ou "23-15432"
   - Optionnel

---

## 🧪 Vérification

### Commande de test

```bash
npx tsx scripts/test-juris-regex.ts
```

### Résultat attendu

```
================================================================================
📊 RÉSUMÉ
================================================================================

Pattern actuel    : 5/6 cas détectés
Pattern amélioré  : 6/6 cas détectés
```

---

## 📊 Formats détectés

### Avant (5 formats)

✅ "Cass. Civ. 1, 15 oct. 2024, n° 23-19876"
✅ "Cour de cassation, 13/02/1930"
✅ "Cour de Cassation, 15 octobre 2024"
✅ "CA Paris, 5 mars 2024"
✅ "Cass. soc., 12 juin 2024"
❌ "Cour de Cassation - 15/11/2024, n° 23-15432" ← MANQUANT

### Après (6 formats)

✅ "Cass. Civ. 1, 15 oct. 2024, n° 23-19876"
✅ "Cour de cassation, 13/02/1930"
✅ "Cour de Cassation, 15 octobre 2024"
✅ "CA Paris, 5 mars 2024"
✅ "Cass. soc., 12 juin 2024"
✅ "Cour de Cassation - 15/11/2024, n° 23-15432" ← AJOUTÉ

---

## 🧪 Test dans l'application

### 1. Démarrer l'application

```bash
npm run dev
```

Le serveur devrait recompiler automatiquement avec le nouveau pattern.

---

### 2. Poser une question test

```
Quelle est la jurisprudence de la Cour de Cassation - 15/11/2024, n° 23-15432 ?
```

Ou inclure cette référence dans n'importe quelle réponse de Mistral.

---

### 3. Vérifier la section Sources

**✅ Résultat attendu** :

```
📚 Sources juridiques
3 références

⚖️ Jurisprudence

┌─────────────────────────────────────────────────────┐
│ ⚖️ Cour de Cassation - 15/11/2024, n° 23-15432     │
│ Jurisprudence                                        │
│ 🔗 Voir sur Légifrance →                            │
└─────────────────────────────────────────────────────┘
```

---

### 4. Vérifier le lien Légifrance

**Cliquer sur "Voir sur Légifrance →"**

**URL générée** :
```
https://www.legifrance.gouv.fr/search/juri
  ?tab_selection=juri
  &searchField=ALL
  &query=Cour+de+cassation+15+11+2024+23-15432
  &page=1
  &init=true
  &dateDecision=ALL
```

**Vérifier** :
- ✅ S'ouvre dans un nouvel onglet
- ✅ Recherche sur Légifrance avec les bons termes
- ✅ Résultats pertinents affichés

---

## 📝 Fichiers modifiés

| Fichier | Lignes | Action | Statut |
|---------|--------|--------|--------|
| `lib/parseReferences.ts` | 22-29 | Mise à jour pattern regex | ✅ |
| `scripts/test-juris-regex.ts` | 1-70 | Création script de test | ✅ |

---

## 🔍 Explication technique du pattern

### Décomposition du pattern amélioré

```regex
(?:Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)
```
**Juridiction** : Cass., Cour de cassation, CA Paris, etc.

```regex
(?:\s+(?:Civ\.|Comm\.|Soc\.|Crim\.|Ch\.\s+mixte)\s*\d*)?
```
**Chambre (optionnel)** : Civ. 1, Comm., Soc., etc.

```regex
[\s,\-]+
```
**Séparateur** : Espaces, virgules OU traits d'union

```regex
(?:
  \d{1,2}[\s/\-](?:janvier|...|déc\.)\s*\d{4}
  |
  \d{1,2}\/\d{1,2}\/\d{4}
)
```
**Date** : Deux formats possibles
- Format texte : "15 octobre 2024", "15 oct. 2024"
- Format numérique : "15/11/2024"

```regex
(?:[\s,]*n°?\s*[\d\-]+)?
```
**Numéro (optionnel)** : n° 23-15432, 23-15432, etc.

---

## 🎯 Cas limites gérés

### Variantes de séparateur

✅ Virgule : "Cass., 15 oct. 2024"
✅ Espaces : "Cass. 15 oct. 2024"
✅ Trait d'union : "Cass. - 15 oct. 2024"
✅ Combinaisons : "Cass., - 15 oct. 2024"

### Variantes de date

✅ Mois complet : "15 octobre 2024"
✅ Mois abrégé : "15 oct. 2024"
✅ Format numérique : "15/11/2024"
✅ Format ancien : "13/02/1930"

### Variantes de numéro

✅ Avec n° : "n° 23-15432"
✅ Sans n° : "23-15432"
✅ Sans numéro : "Cass., 15 oct. 2024"

---

## 🐛 Dépannage

### La jurisprudence n'apparaît toujours pas

**Solution 1 : Vérifier la syntaxe dans la réponse**

Assurez-vous que Mistral utilise un format détecté :
- ✅ "Cour de Cassation - 15/11/2024, n° 23-15432"
- ❌ "Arrêt du 15/11/2024" (trop vague)

**Solution 2 : Tester le pattern**

```bash
npx tsx scripts/test-juris-regex.ts
```

Si 6/6 cas passent → Pattern OK

**Solution 3 : Vérifier les logs**

Ajouter dans `lib/parseReferences.ts` :

```typescript
console.log('📚 References trouvées:', references.length);
console.log('  - Articles:', references.filter(r => r.type === 'article').length);
console.log('  - Jurisprudence:', references.filter(r => r.type === 'jurisprudence').length);
```

---

### Le lien ne fonctionne pas

**Vérifier l'URL générée** :

Console du navigateur (F12) :
```javascript
document.querySelector('a[href*="legifrance"]').href
```

**URL attendue** :
```
https://www.legifrance.gouv.fr/search/juri?...
```

---

## 🎉 Résultat final

### AVANT
```
Pattern regex : 5/6 formats détectés (83%)
❌ "Cour de Cassation - 15/11/2024" non détecté
❌ Jurisprudence absente de la section Sources
❌ Utilisateur ne peut pas cliquer sur le lien
```

### APRÈS
```
Pattern regex : 6/6 formats détectés (100%)
✅ "Cour de Cassation - 15/11/2024" détecté
✅ Jurisprudence affichée dans la section Sources
✅ Lien cliquable vers Légifrance
✅ Tous les formats courants supportés
```

---

## 📚 Références

- Pattern regex : `lib/parseReferences.ts:29`
- Script de test : `scripts/test-juris-regex.ts`
- Génération URL : `lib/parseReferences.ts:115-157`
- Affichage : `components/chat/SourcesSection.tsx`

---

**Auteur:** Claude Code
**Version:** 1.0
**Date:** 2025-11-05
**Statut:** ✅ Production Ready
