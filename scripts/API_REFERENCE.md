# 📚 Référence API Légifrance (PISTE)

## 🎯 URLs à utiliser

### OAuth (Authentification)

```
POST https://oauth.piste.gouv.fr/api/oauth/token
```

**Headers :**
```typescript
{
  'Authorization': `Basic ${base64(client_id:client_secret)}`,
  'Content-Type': 'application/x-www-form-urlencoded'
}
```

**Body :**
```
grant_type=client_credentials&scope=openid
```

**Réponse :**
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid"
}
```

---

### API Légifrance (via PISTE)

**Base URL :**
```
https://api.piste.gouv.fr/dila/legifrance/lf-engine-app
```

#### 1. Consulter un code complet

```
POST https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/code
```

**Headers :**
```typescript
{
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
}
```

**Body :**
```json
{
  "textId": "LEGITEXT000006070721",
  "date": "2024-01-01"
}
```

**Réponse :**
Structure hiérarchique du code avec tous les articles.

#### 2. Consulter un article

```
POST https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/article
```

**Body :**
```json
{
  "id": "LEGIARTI000006437042"
}
```

#### 3. Rechercher

```
POST https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/search
```

**Body :**
```json
{
  "recherche": {
    "champs": [{
      "typeChamp": "ALL",
      "criteres": [{
        "typeRecherche": "UN_DES_MOTS",
        "valeur": "responsabilité civile"
      }]
    }],
    "pageNumber": 1,
    "pageSize": 10
  }
}
```

---

## 🔑 Identifiants requis

**Variables d'environnement (.env.local) :**

```env
LEGIFRANCE_CLIENT_ID=your-client-id
LEGIFRANCE_CLIENT_SECRET=your-client-secret
```

**Obtenir des identifiants :**
1. Créer un compte sur [PISTE](https://piste.gouv.fr)
2. Créer une application
3. Noter le `client_id` et `client_secret`

---

## 📖 Codes juridiques disponibles

| Code | Légifrance ID | Articles |
|------|---------------|----------|
| Code Civil | `LEGITEXT000006070721` | ~2 500 |
| Code Pénal | `LEGITEXT000006070719` | ~800 |
| Code du Travail | `LEGITEXT000006072050` | ~7 000 |
| Code de Commerce | `LEGITEXT000005634379` | ~900 |
| Code de Procédure Civile | `LEGITEXT000006070716` | ~1 500 |
| Code de Procédure Pénale | `LEGITEXT000006071154` | ~900 |

---

## 🛠️ Exemple complet (TypeScript)

```typescript
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// 1. Authentification OAuth
async function getToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.LEGIFRANCE_CLIENT_ID}:${process.env.LEGIFRANCE_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://oauth.piste.gouv.fr/api/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=openid',
  });

  const data = await response.json();
  return data.access_token;
}

// 2. Récupérer un code
async function getCode(token: string, codeId: string): Promise<any> {
  const response = await fetch(
    'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/code',
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        textId: codeId,
        date: new Date().toISOString().split('T')[0],
      }),
    }
  );

  return response.json();
}

// Utilisation
const token = await getToken();
const codeData = await getCode(token, 'LEGITEXT000006070721');
```

---

## ⚠️ Erreurs courantes

### Erreur 401 (Unauthorized)

**Causes possibles :**

1. **Token expiré** (après 1 heure)
   - Solution : Régénérer un nouveau token

2. **Mauvaise URL API**
   - ❌ Incorrect : `https://api.legifrance.gouv.fr`
   - ✅ Correct : `https://api.piste.gouv.fr`

3. **Token mal formaté**
   - Vérifier : `Authorization: Bearer ${token}` (pas `Basic`)

4. **Identifiants invalides**
   - Vérifier `LEGIFRANCE_CLIENT_ID` et `LEGIFRANCE_CLIENT_SECRET`

### Erreur 400 (Bad Request)

**Causes possibles :**

1. **Body JSON mal formaté**
   - Vérifier la syntaxe JSON
   - Vérifier les champs requis (`textId`, `date`)

2. **ID de code invalide**
   - Vérifier que le `LEGITEXT...` existe

3. **Content-Type manquant**
   - Ajouter : `Content-Type: application/json`

### Erreur 429 (Too Many Requests)

**Causes possibles :**

1. **Rate limit dépassé**
   - Solution : Ajouter des délais entre requêtes (500ms-2s)
   - Réduire le nombre de requêtes simultanées

---

## 🔍 Débogage

### Test rapide

```bash
# Test OAuth + API
npx tsx scripts/test-legifrance-api.ts
```

### Vérifier le token

```bash
# Afficher le token (ne pas logger en production !)
const token = await getToken();
console.log('Token:', token.substring(0, 50) + '...');
console.log('Longueur:', token.length);
```

### Test avec curl

```bash
# 1. Obtenir le token
TOKEN=$(curl -X POST https://oauth.piste.gouv.fr/api/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=openid" \
  | jq -r '.access_token')

# 2. Appeler l'API
curl -X POST https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/consult/code \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"textId":"LEGITEXT000006070721","date":"2024-01-01"}' \
  | jq '.sections[0]'
```

---

## 📝 Notes

- Les tokens expirent après **1 heure (3600 secondes)**
- La limite de rate est **variable selon votre abonnement PISTE**
- Les dates doivent être au format **YYYY-MM-DD**
- Les réponses sont en **JSON**
- L'encoding est en **UTF-8**

---

## 🔗 Liens utiles

- [Documentation PISTE](https://piste.gouv.fr)
- [Documentation Légifrance API](https://www.legifrance.gouv.fr/contenu/menu/autour-de-la-base/developpeurs/api-dila)
- [Code source des scripts](./import-all-codes.ts)

---

**Dernière mise à jour :** ${new Date().toLocaleDateString('fr-FR')}
