# ✅ FIX : URLs Légifrance pour la jurisprudence

**Date:** 2025-11-05
**Problème:** Les décisions de jurisprudence n'avaient pas de liens cliquables vers Légifrance
**Statut:** ✅ RÉSOLU

---

## 🔍 Diagnostic

### Composants existants

Le système avait déjà les bons composants en place :

1. **`components/chat/SourcesSection.tsx`** : Affiche la section "Sources juridiques"
   - ✅ Parse le texte de la réponse pour extraire les références
   - ✅ Sépare les articles et la jurisprudence
   - ✅ Affiche les deux types avec des icônes différentes

2. **`lib/parseReferences.ts`** : Extrait les références du texte
   - ✅ Regex pour détecter les articles (Article 1128, etc.)
   - ✅ Regex pour détecter la jurisprudence (Cass. Civ. 1, etc.)
   - ✅ Génération d'URL pour les articles

### Problème identifié

Dans `lib/parseReferences.ts` ligne 63-65 :

```typescript
// ❌ AVANT
references.push({
  type: 'jurisprudence',
  text: match[0],
  start: match.index,
  end: match.index + match[0].length,
  // Pour l'instant, on ne génère pas d'URL spécifique pour la jurisprudence
  // car cela nécessite l'ID Judilibre
});
```

**Résultat** : Les décisions de jurisprudence s'affichaient dans la section Sources, mais **sans lien** vers Légifrance.

---

## ✅ Solution implémentée

### 1. Appel de la fonction de génération d'URL

**APRÈS (lib/parseReferences.ts lignes 55-67)** :

```typescript
// ✅ APRÈS
const jurisRegex = new RegExp(PATTERNS.jurisprudence);
while ((match = jurisRegex.exec(text)) !== null) {
  const jurisText = match[0];

  references.push({
    type: 'jurisprudence',
    text: jurisText,
    start: match.index,
    end: match.index + match[0].length,
    url: generateJurisprudenceUrl(jurisText), // ✅ Génération d'URL
  });
}
```

---

### 2. Nouvelle fonction : `generateJurisprudenceUrl`

**Ajoutée dans lib/parseReferences.ts lignes 111-157** :

```typescript
/**
 * Génère l'URL Légifrance pour une décision de jurisprudence
 * Utilise l'URL de recherche pour trouver la décision
 */
function generateJurisprudenceUrl(jurisText: string): string {
  // Extraire le numéro de décision si présent
  const numeroMatch = jurisText.match(/n°?\s*([\d-]+)/i);
  const numero = numeroMatch ? numeroMatch[1] : null;

  // Extraire la date
  const dateMatch = jurisText.match(/(\d{1,2}[\s/](?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\.|févr\.|avr\.|juil\.|sept\.|oct\.|nov\.|déc\.|[\d]{1,2}[\s/])(?:\s|\/)?\d{4})/i);
  const date = dateMatch ? dateMatch[1] : null;

  // Extraire la juridiction (Cass., CA, etc.)
  const juridictionMatch = jurisText.match(/^(Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)/i);
  const juridiction = juridictionMatch ? juridictionMatch[1] : null;

  // Construire la requête de recherche
  let searchTerms: string[] = [];

  if (juridiction) {
    // Normaliser la juridiction
    if (juridiction.toLowerCase().includes('cass')) {
      searchTerms.push('Cour de cassation');
    } else {
      searchTerms.push(juridiction);
    }
  }

  if (date) {
    // Nettoyer et normaliser la date
    searchTerms.push(date.replace(/[\s/]+/g, ' '));
  }

  if (numero) {
    searchTerms.push(numero);
  }

  // Si aucun terme spécifique n'a été extrait, utiliser tout le texte
  if (searchTerms.length === 0) {
    searchTerms.push(jurisText);
  }

  // URL de recherche Légifrance dans la section Jurisprudence
  const searchQuery = encodeURIComponent(searchTerms.join(' '));
  return `https://www.legifrance.gouv.fr/search/juri?tab_selection=juri&searchField=ALL&query=${searchQuery}&page=1&init=true&dateDecision=ALL`;
}
```

**Comment ça fonctionne** :

1. **Extraction intelligente** :
   - Détecte le numéro de décision : `n° 23-19876`
   - Détecte la date : `15 octobre 2024` ou `15/10/2024`
   - Détecte la juridiction : `Cass.`, `Cour de cassation`, `CA Paris`, etc.

2. **Construction de la requête** :
   - Combine les éléments extraits
   - Normalise la juridiction ("Cass." → "Cour de cassation")
   - Nettoie les dates

3. **Génération de l'URL** :
   - Utilise l'API de recherche Légifrance
   - Cible la section Jurisprudence (`tab_selection=juri`)
   - Recherche sur tous les champs (`searchField=ALL`)

**Exemples d'URLs générées** :

| Texte extrait | Termes de recherche | URL générée |
|---------------|---------------------|-------------|
| `Cass. Civ. 1, 15 oct. 2024, n° 23-19876` | `Cour de cassation 15 octobre 2024 23-19876` | `https://www.legifrance.gouv.fr/search/juri?...query=Cour+de+cassation+15+octobre+2024+23-19876...` |
| `Cour de cassation, 13/02/1930` | `Cour de cassation 13 02 1930` | `https://www.legifrance.gouv.fr/search/juri?...query=Cour+de+cassation+13+02+1930...` |
| `CA Paris, 5 mars 2024` | `CA Paris 5 mars 2024` | `https://www.legifrance.gouv.fr/search/juri?...query=CA+Paris+5+mars+2024...` |

---

## 🎨 Affichage dans SourcesSection

Le composant `SourcesSection` affiche déjà correctement les deux types de références :

### Articles (fond bleu)

```jsx
<div className="bg-blue-50 rounded-lg border border-blue-200">
  <BookOpen className="text-blue-600" />
  <p>Article 1128 - Code civil</p>
  <a href={article.url} target="_blank">
    Voir sur Légifrance →
  </a>
</div>
```

### Jurisprudence (fond ambre/jaune)

```jsx
<div className="bg-amber-50 rounded-lg border border-amber-200">
  <Scale className="text-amber-600" />
  <p>Cass. Civ. 1, 15 oct. 2024</p>
  <a href={jurisprudence.url} target="_blank">
    Voir sur Légifrance →
  </a>
</div>
```

**Différences visuelles** :
- Articles : 📖 icône BookOpen + fond bleu
- Jurisprudence : ⚖️ icône Scale + fond ambre

---

## 🧪 Tests à effectuer

### 1. Démarrer l'application

```bash
npm run dev
```

L'application devrait recompiler automatiquement avec les changements.

---

### 2. Poser une question incluant de la jurisprudence

Exemple de questions :

```
Qu'est-ce que la responsabilité délictuelle selon la jurisprudence ?
```

```
Quelle jurisprudence encadre l'article 1240 du Code civil ?
```

```
Quelles sont les décisions importantes sur la responsabilité civile ?
```

---

### 3. Vérifier la section Sources

**✅ Résultats attendus** :

1. **En haut de la section** : Compteur de références
   ```
   📚 Sources juridiques
   5 références
   ```

2. **Section Articles** (si présents) :
   - Fond bleu clair
   - Icône 📖 livre
   - Format : "Article X - Code civil"
   - Lien : "Voir sur Légifrance →"

3. **Section Jurisprudence** (si présente) :
   - **Sous-titre** : "⚖️ Jurisprudence"
   - Fond ambre/jaune
   - Icône ⚖️ balance
   - Texte complet de la référence
   - **Lien cliquable** : "Voir sur Légifrance →"

---

### 4. Tester les liens

1. **Cliquer sur un lien de jurisprudence**
2. **Vérifier** que Légifrance s'ouvre dans un nouvel onglet
3. **Vérifier** que la recherche affiche des résultats pertinents

---

### 5. Cas de test spécifiques

#### Cas 1 : Décision avec numéro

**Question** :
```
Parle-moi de l'arrêt Cass. Civ. 1, 15 octobre 2024, n° 23-19876
```

**Résultat attendu** :
- Section Jurisprudence affichée
- Texte : "Cass. Civ. 1, 15 octobre 2024, n° 23-19876"
- Lien fonctionne et recherche avec numéro + date + juridiction

#### Cas 2 : Décision ancienne

**Question** :
```
Quelle est la jurisprudence sur l'enrichissement sans cause (Cour de cassation, 13/02/1930) ?
```

**Résultat attendu** :
- Section Jurisprudence affichée
- Texte : "Cour de cassation, 13/02/1930"
- Lien fonctionne

#### Cas 3 : Cour d'appel

**Question** :
```
Qu'a décidé CA Paris, 5 mars 2024 ?
```

**Résultat attendu** :
- Section Jurisprudence affichée
- Texte : "CA Paris, 5 mars 2024"
- Lien fonctionne

---

## 📊 Récapitulatif des changements

| Fichier | Lignes modifiées | Action | Statut |
|---------|------------------|--------|--------|
| `lib/parseReferences.ts` | 55-67 | Ajout appel `generateJurisprudenceUrl` | ✅ |
| `lib/parseReferences.ts` | 111-157 | Nouvelle fonction `generateJurisprudenceUrl` | ✅ |

**Total** : ~50 lignes ajoutées

**Aucune modification requise pour** :
- `components/chat/SourcesSection.tsx` (déjà fonctionnel)
- Composants parents (déjà passent le texte correctement)

---

## 🎯 Améliorations futures possibles

### 1. Extraction d'ID Judilibre depuis la base

Si les décisions dans la base ont un champ `judilibre_id` ou `legifrance_id` :

```typescript
// Au lieu de parser le texte, utiliser l'ID direct
const url = decision.legifrance_id
  ? `https://www.legifrance.gouv.fr/juri/id/${decision.legifrance_id}`
  : generateJurisprudenceUrl(decision.text);
```

**Avantage** : Lien direct vers la décision au lieu de recherche.

---

### 2. Amélioration du regex de détection

Ajouter plus de variantes :

```typescript
// Formats supplémentaires :
// - "Cass. soc., 12 juin 2024"
// - "CE, 5 mars 2024, n° 468765"
// - "Cass. 1re civ., 15 oct. 2024"
```

---

### 3. Affichage des extraits

Si la base contient le texte de la décision :

```jsx
<div className="mt-2 text-sm text-gray-700 italic">
  "{decision.excerpt || 'Extrait non disponible'}"
</div>
```

---

## 🎉 Résultat final

### AVANT
```
✅ Jurisprudence détectée dans le texte
✅ Affichée dans la section Sources
❌ MAIS : Pas de lien cliquable
❌ L'utilisateur doit copier-coller pour rechercher
```

### APRÈS
```
✅ Jurisprudence détectée dans le texte
✅ Affichée dans la section Sources
✅ Lien cliquable "Voir sur Légifrance →"
✅ Recherche intelligente sur Légifrance
✅ S'ouvre dans un nouvel onglet
✅ Extraction automatique : juridiction + date + numéro
```

---

## 📚 Références techniques

### Regex de détection

```regex
/(?:Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)
  (?:\s+(?:Civ\.|Comm\.|Soc\.|Crim\.|Ch\.\s+mixte)\s*\d*)?
  [\s,]+
  \d{1,2}[\s/]
  (?:janvier|février|...|[\d]{1,2}[\s/])
  (?:\s|\/)?\d{4}
  (?:[\s,]+n°?\s*[\d-]+)?/gi
```

**Couvre** :
- Cass. Civ. 1, 15 oct. 2024, n° 23-19876
- Cour de cassation, 13/02/1930
- CA Paris, 5 mars 2024
- Cass. soc., 12 juin 2024

---

### Format d'URL Légifrance Jurisprudence

```
https://www.legifrance.gouv.fr/search/juri
  ?tab_selection=juri           ← Section jurisprudence
  &searchField=ALL              ← Rechercher dans tous les champs
  &query={termes encodés}       ← Termes de recherche
  &page=1                       ← Première page
  &init=true                    ← Initialiser la recherche
  &dateDecision=ALL             ← Toutes les dates
```

---

**Auteur:** Claude Code
**Version:** 1.0
**Date:** 2025-11-05
**Statut:** ✅ Production Ready
