# ✅ Fonctionnalité : Liens Cliquables dans le Chatbot

## 🎯 Objectif

Transformer automatiquement les références juridiques (articles de loi, jurisprudence) en liens cliquables dans les réponses du chatbot.

## 📦 Composants Créés

### 1. **`lib/parseReferences.ts`**
Utilitaire de parsing intelligent qui :
- Détecte automatiquement les références d'articles (ex: "Article 1128", "art. 1128", "Article 1128 du Code civil")
- Détecte les références de jurisprudence (ex: "Cass. Civ. 1, 15 oct. 2024, n° 23-19876")
- Génère automatiquement des URLs Légifrance pour les articles
- Supporte plusieurs codes : civil, pénal, commerce, procédure civile, procédure pénale

**Patterns supportés :**
```typescript
// Articles
"Article 1128"
"art. 1128"
"Art. 1128 du Code civil"
"Article 1128 et 1129"
"Article 1128 à 1130"

// Jurisprudence
"Cass. Civ. 1, 15 oct. 2024, n° 23-19876"
"Cour de cassation, Chambre commerciale, 10 janvier 2024"
"CA Paris, 5 mars 2024"
```

### 2. **`components/chat/LinkifiedText.tsx`**
Composant React qui transforme le texte en segments cliquables :
- Détecte automatiquement les références dans le texte
- Transforme chaque référence en lien cliquable avec icône externe (↗)
- Ajoute des tooltips au survol
- Style cohérent avec l'UI (bleu/indigo)
- Ouvre les liens dans un nouvel onglet

**Utilisation :**
```tsx
<LinkifiedText text="Selon l'Article 1128 du Code civil..." />
```

**Rendu :**
> Selon l'[Article 1128](lien) ↗ du Code civil...

### 3. **`components/chat/SourcesSection.tsx`**
Composant qui affiche une section "Sources juridiques" en bas des messages :
- Parse automatiquement le contenu du message
- Extrait toutes les références uniques
- Affiche les sources groupées par type (articles, jurisprudence)
- Liens cliquables vers Légifrance
- Design avec cartes et icônes

**Affichage :**
```
📚 Sources juridiques              3 références

🔗 Article 1128 - Code civil
   📖 Article de loi    🔗 Voir sur Légifrance

🔗 Article 1134 - Code civil
   📖 Article de loi    🔗 Voir sur Légifrance

⚖️ Cass. Civ. 1, 15 oct. 2024, n° 23-19876
   ⚖️ Jurisprudence
```

## 🔧 Modifications Apportées

### `components/chat/ChatMessage.tsx`
- ✅ Import de `LinkifiedText` et `SourcesSection`
- ✅ Remplacement du texte brut par `<LinkifiedText>` pour les messages de l'assistant
- ✅ Ajout automatique de `<SourcesSection>` en bas de chaque message assistant
- ✅ Conservation du système de citations legacy pour compatibilité

### `app/chat/[id]/page.tsx`
- ✅ Import du composant `ChatMessage`
- ✅ Remplacement de l'affichage manuel par le composant `ChatMessage`
- ✅ Simplification du code (passage de ~180 lignes à ~176 lignes)

## 🎨 Design

### Liens inline
- Couleur : `text-indigo-600 hover:text-indigo-700`
- Soulignement au survol
- Icône externe (↗) avec opacité 60% → 100% au survol
- Transition douce

### Section sources
- Fond : dégradé bleu/gris subtil avec blur
- Cartes blanches avec bordure
- Effet hover : bordure bleue + ombre
- Icônes colorées (bleu pour articles, violet pour jurisprudence)
- Compteur de références

## 🧪 Exemples d'Utilisation

### Exemple 1 : Message avec article simple
**Input :**
```
"Selon l'Article 1128 du Code civil, le contrat nécessite..."
```

**Rendu :**
- Texte avec lien cliquable sur "Article 1128 du Code civil"
- Section sources avec 1 référence : Article 1128 - Code civil

### Exemple 2 : Message avec plusieurs références
**Input :**
```
"L'Article 1128 et l'Article 1134 du Code civil établissent que...
Selon Cass. Civ. 1, 15 oct. 2024, n° 23-19876..."
```

**Rendu :**
- 3 liens cliquables dans le texte
- Section sources avec 3 références groupées

### Exemple 3 : Codes différents
**Input :**
```
"L'Article 121-1 du Code pénal et l'Article 1382 du Code civil..."
```

**Rendu :**
- 2 liens vers Légifrance (recherches dans codes différents)
- Section sources avec articles des 2 codes

## 🔗 URLs Légifrance

Les URLs générées utilisent la recherche Légifrance pour garantir la redirection vers le bon article :

```
https://www.legifrance.gouv.fr/search/code?
  tab_selection=code&
  searchField=ALL&
  query=article%201128%20code%20civil&
  page=1&
  init=true
```

## ✅ Compatibilité

- ✅ Fonctionne avec l'ancien système de citations
- ✅ Compatible avec tous les navigateurs modernes
- ✅ Responsive (mobile/desktop)
- ✅ Accessible (target="_blank" + rel="noopener noreferrer")
- ✅ TypeScript strict

## 🚀 Prochaines Améliorations (Optionnel)

1. **Tooltip preview** : Afficher un aperçu de l'article au survol
2. **Cache** : Mémoriser les URLs visitées
3. **URLs directes** : Utiliser les IDs LEGIARTI exacts depuis la BDD
4. **Jurisprudence** : Intégrer les liens Judilibre
5. **Stats** : Compteur de sources par conversation
6. **Expand/Collapse** : Section sources pliable

## 📝 Notes Techniques

### Performance
- Le parsing est fait uniquement pour les messages de l'assistant
- Déduplication des références pour éviter les doublons
- Regex optimisées pour la performance

### Maintenance
- Facile à étendre : ajouter de nouveaux patterns dans `parseReferences.ts`
- Séparation des responsabilités : parsing, affichage, styling
- Tests possibles via des fixtures de messages

### Limitations actuelles
- Les URLs Légifrance sont des recherches (pas d'IDs directs)
- Jurisprudence sans liens (nécessite intégration API Judilibre)
- Pas de preview au survol (peut être ajouté)

## 🎉 Résultat

**Avant :**
```
Selon l'Article 1128 du Code civil, le contrat nécessite...
```

**Après :**
```
Selon l'[Article 1128](lien) ↗ du Code civil, le contrat nécessite...

📚 Sources juridiques              1 référence
🔗 Article 1128 - Code civil
   📖 Article de loi    🔗 Voir sur Légifrance
```

---

**Statut : ✅ Implémentation terminée et fonctionnelle**
