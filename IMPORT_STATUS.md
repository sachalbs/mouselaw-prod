# Import Status - Mouse Law

## ✅ Code Civil Import (PISTE API)

**Status**: 🟢 EN COURS (20% complété)

- **Source**: API PISTE Légifrance (`/consult/code/tableMatieres` + `/consult/getArticle`)
- **OAuth2**: ✅ Fonctionnel (x-www-form-urlencoded + Basic Auth)
- **Progress**: 689/3433 articles récupérés (20%)
- **Temps restant**: ~25 minutes
- **Fichier de sortie**: `data/code-civil-api.json`
- **Script**: `scripts/import-legifrance-complete.ts`

### Détails techniques

```
Endpoint table des matières: /consult/code/tableMatieres
Endpoint article: /consult/getArticle
Méthode: POST
Rate limit: 600ms entre requêtes (100 req/min)
Timeout: 30s par requête (quelques timeouts mais le script continue)
```

### Structure des données

```json
{
  "numero": "1240",
  "titre": "Responsabilité du fait personnel",
  "texte": "Tout fait quelconque de l'homme...",
  "section": "De la responsabilité civile",
  "livre": "Livre III : ...",
  "categorie": "responsabilite"
}
```

---

## ⚠️ Jurisprudence Import (API Judilibre)

**Status**: 🔴 BLOQUÉ - Accès refusé (403 Forbidden)

- **Source**: API PISTE Judilibre (`/v1.0/search`)
- **Problème**: L'application PISTE n'a pas accès à l'API Judilibre
- **Script**: `scripts/import-jurisprudence-api.ts`

### Solution requise

**Action à faire sur le portail PISTE** (https://piste.gouv.fr/):

1. Se connecter au portail PISTE
2. Aller dans "Mes Applications"
3. Sélectionner l'application MOUSELAW
4. Ajouter l'API **"Judilibre"** aux APIs autorisées
5. Accepter les CGU de Judilibre
6. Récupérer le KeyId spécifique à Judilibre (si différent)

### Alternatives temporaires

En attendant l'accès à l'API Judilibre:

1. **Option 1**: Utiliser le fichier existant `data/jurisprudence-complete.json` (3 arrêts essentiels)
2. **Option 2**: Ajouter manuellement des arrêts fondamentaux
3. **Option 3**: Utiliser l'API open data de data.gouv.fr (si disponible)

### Exemple de requête Judilibre (une fois activé)

```bash
# Avec KeyId
curl -H "accept: application/json" \
     -H "KeyId: YOUR_JUDILIBRE_KEY" \
     "https://api.piste.gouv.fr/cassation/judilibre/v1.0/search?query=responsabilité&publication=b"

# OU avec OAuth2 Bearer
curl -H "accept: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     "https://api.piste.gouv.fr/cassation/judilibre/v1.0/search?query=responsabilité&publication=b"
```

---

## 📊 Prochaines étapes

### Une fois l'import Code civil terminé

1. **Vérifier les articles**
   ```bash
   cat data/code-civil-api.json | jq '.articles | length'
   cat data/code-civil-api.json | jq '.articles[0:3]'
   ```

2. **Importer dans Supabase**
   ```bash
   npx tsx scripts/import-and-embed.ts
   ```
   - Lecture du fichier JSON
   - Génération des embeddings Mistral
   - Insertion dans Supabase avec pgvector

3. **Tester la recherche vectorielle**
   ```bash
   # Via l'API Next.js
   curl -X POST http://localhost:3000/api/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "Quelle est la responsabilité du fait personnel?"}'
   ```

### Pour activer la jurisprudence

1. **Activer Judilibre sur PISTE** (voir ci-dessus)
2. **Relancer l'import**
   ```bash
   npx tsx scripts/import-jurisprudence-api.ts --test  # Test avec 10 arrêts
   npx tsx scripts/import-jurisprudence-api.ts         # Import complet
   ```
3. **Appliquer migration Supabase**
   ```sql
   -- Depuis supabase/migrations/add_jurisprudence_table.sql
   CREATE TABLE public.jurisprudence (...);
   ```
4. **Importer dans Supabase**
   ```bash
   npx tsx scripts/import-jurisprudence.ts
   ```

---

## 🎯 MVP Actuel

### Ce qui fonctionne

- ✅ OAuth2 authentication avec PISTE
- ✅ Import Code civil depuis API officielle (en cours)
- ✅ Database Supabase avec pgvector
- ✅ Embeddings Mistral AI
- ✅ Chatbot RAG Next.js
- ✅ UI Tailwind + shadcn/ui

### Ce qui nécessite configuration

- ⚠️ Accès API Judilibre (activation requise sur PISTE)
- ⚠️ Import jurisprudence (dépend de Judilibre)

### Workaround temporaire

Utiliser `data/jurisprudence-complete.json` avec 3 arrêts essentiels:
- Arrêt Jand'heur (1930) - Responsabilité du fait des choses
- Arrêt Perruche (2000) - Préjudice de vie
- Arrêt Chronopost (1996) - Obligation essentielle

---

## 📝 Logs et Debugging

### Code civil import

```bash
# Voir l'état en temps réel
tail -f /dev/stdout  # Si lancé en foreground

# Vérifier le fichier de sortie
ls -lh data/code-civil-api.json
cat data/code-civil-api.json | jq '.articles | length'
```

### Jurisprudence import

```bash
# Test de connexion Judilibre
curl -H "KeyId: ${PISTE_API_KEY}" \
  "https://api.piste.gouv.fr/cassation/judilibre/v1.0/search?query=test"

# Résultat attendu si accès non activé: 403 Forbidden
# Résultat attendu si accès activé: 200 OK avec résultats JSON
```

---

**Mis à jour**: 2025-10-26 à 12:17 UTC
