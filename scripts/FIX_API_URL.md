# 🔧 Correction URL API Légifrance (PISTE)

## 🐛 Problème identifié

Les scripts d'import recevaient une **erreur 401 (Unauthorized)** de l'API Légifrance, malgré une authentification OAuth réussie.

### Cause racine

Les scripts utilisaient deux URLs différentes :
- ✅ **OAuth** : `https://oauth.piste.gouv.fr` (correct)
- ❌ **API Légifrance** : `https://api.legifrance.gouv.fr` (incorrect)

**Le token OAuth obtenu depuis PISTE ne fonctionne pas avec l'API api.legifrance.gouv.fr !**

## ✅ Solution appliquée

Tous les appels API doivent utiliser l'URL PISTE :

**Avant (incorrect) :**
```typescript
const LEGIFRANCE_API_URL = 'https://api.legifrance.gouv.fr/dila/legifrance/lf-engine-app';
```

**Après (correct) :**
```typescript
const LEGIFRANCE_API_URL = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';
```

## 📝 Fichiers corrigés

### Scripts d'import
- ✅ `scripts/import-all-codes.ts` ⭐
- ✅ `scripts/import-civil-code.ts`

### Autres fichiers
- ✅ `lib/legifrance-api.ts` (déjà correct)

## 🔍 Explication technique

### Architecture PISTE

PISTE (Plateforme d'Interopérabilité pour les Services de l'État) est la passerelle officielle pour accéder aux APIs publiques françaises, dont Légifrance.

```
┌─────────────────────────────────────────────────────┐
│  OAuth PISTE                                        │
│  https://oauth.piste.gouv.fr                        │
│  → Obtention du token Bearer                        │
└─────────────────────────────────────────────────────┘
                      ↓ Token
┌─────────────────────────────────────────────────────┐
│  API Légifrance via PISTE                           │
│  https://api.piste.gouv.fr/dila/legifrance/...     │
│  → Appels API avec le token                         │
└─────────────────────────────────────────────────────┘
```

### Pourquoi ça ne marchait pas ?

1. **Authentification réussie** sur `oauth.piste.gouv.fr`
   - Obtention d'un token Bearer valide
   - ✅ Pas d'erreur à cette étape

2. **Appel API échoue** sur `api.legifrance.gouv.fr`
   - Le token PISTE n'est pas reconnu par api.legifrance.gouv.fr
   - ❌ Erreur 401 Unauthorized

**Raison :** Les tokens OAuth sont liés au domaine. Un token PISTE ne fonctionne que sur `api.piste.gouv.fr`.

## 🧪 Vérification

Pour vérifier que la correction fonctionne :

```bash
# Test avec check-setup (doit passer au vert)
npx tsx scripts/check-setup.ts
```

**Résultat attendu :**
```
🏛️  Vérification de l'API Légifrance (PISTE)...
✅ Authentification PISTE réussie
ℹ️  Token valide obtenu (expire dans 3600s)
```

Puis lancer l'import :

```bash
# Import complet
npx tsx scripts/import-all-codes.ts
```

**Résultat attendu :**
```
📥 Récupération des articles du Code Civil...
   ✅ Réponse reçue de Légifrance
   ✅ 2534 articles extraits
```

## 📚 Référence API

### Endpoints corrects

| Service | URL |
|---------|-----|
| OAuth Token | `https://oauth.piste.gouv.fr/api/oauth/token` |
| Consult Code | `https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/code` |
| Consult Article | `https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/article` |
| Search | `https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/search` |

### Format de la requête

```typescript
// 1. Obtenir le token
const response = await fetch('https://oauth.piste.gouv.fr/api/oauth/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${base64Credentials}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials&scope=openid',
});

// 2. Utiliser le token pour l'API
const apiResponse = await fetch('https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/code', {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    textId: 'LEGITEXT000006070721',
    date: '2024-01-01',
  }),
});
```

## ⚠️ Points d'attention

### Variables d'environnement

Les identifiants sont les mêmes pour PISTE et Légifrance :

```env
# Ces identifiants fonctionnent avec api.piste.gouv.fr
LEGIFRANCE_CLIENT_ID=your-client-id
LEGIFRANCE_CLIENT_SECRET=your-client-secret
```

### Token expiration

Les tokens OAuth PISTE expirent après **1 heure (3600 secondes)**.

Pour les imports longs :
- Le script `import-all-codes.ts` obtient un seul token au début
- ✅ Valable pour ~3-4 heures d'import
- Si import > 1h, le token pourrait expirer
- Solution : Régénérer le token si erreur 401 après 1h

## 🎯 Résumé

**Règle simple :** Tout ce qui touche à Légifrance via PISTE doit utiliser `api.piste.gouv.fr`.

### URLs à utiliser

✅ **Correct :**
- `https://oauth.piste.gouv.fr` (OAuth)
- `https://api.piste.gouv.fr/dila/legifrance/...` (API)

❌ **Incorrect :**
- `https://api.legifrance.gouv.fr/...` (ne fonctionne pas avec token PISTE)

---

**Correction effectuée le :** ${new Date().toLocaleDateString('fr-FR')}
**Impact :** Tous les imports Légifrance fonctionnent maintenant correctement
