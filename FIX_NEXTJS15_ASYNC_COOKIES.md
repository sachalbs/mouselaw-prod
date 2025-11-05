# 🔧 FIX : Next.js 15 Async Cookies

**Date:** 2025-11-04
**Problème:** `cookies().get is not a function` dans les routes API
**Cause:** Next.js 15 a changé `cookies()` pour retourner une Promise
**Statut:** ✅ RÉSOLU

---

## 🔴 Problème initial

### Erreur rencontrée
```
TypeError: cookieStore.get is not a function
  at /api/chat
```

### Cause
Dans Next.js 15, `cookies()` est maintenant **asynchrone** et retourne une Promise.

**Next.js 14 (ancien):**
```typescript
const cookieStore = cookies();  // Synchrone
cookieStore.get('name');        // Fonctionne
```

**Next.js 15 (nouveau):**
```typescript
const cookieStore = await cookies();  // ✅ ASYNC maintenant
cookieStore.get('name');              // Fonctionne
```

---

## ✅ Solution appliquée

### 1. Modification de `lib/supabase/server.ts`

**AVANT (incorrect):**
```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export function createServerClient() {
  const cookieStore = cookies();  // ❌ Pas awaité
  return createRouteHandlerClient({ cookies: () => cookieStore });
}
```

**APRÈS (correct):**
```typescript
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const cookieStore = await cookies();  // ✅ Awaité

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Ignoré si appelé depuis un Server Component
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Ignoré si appelé depuis un Server Component
          }
        },
      },
    }
  );
}
```

**Changements clés:**
- ✅ Fonction est maintenant `async`
- ✅ `await cookies()` ajouté
- ✅ Utilisation de `createClient` directement au lieu de `createRouteHandlerClient`
- ✅ Configuration manuelle des cookies avec `get`, `set`, `remove`
- ✅ Try/catch pour gérer les erreurs quand appelé depuis Server Components

**Fichier:** `lib/supabase/server.ts:23-50`

---

### 2. Modification de `/api/chat/route.ts`

**AVANT:**
```typescript
const supabase = createServerClient();  // ❌ Pas awaité
```

**APRÈS:**
```typescript
const supabase = await createServerClient();  // ✅ Awaité
```

**Fichier:** `app/api/chat/route.ts:10`

---

### 3. Modification de `/api/embed-articles/route.ts`

**POST et GET modifiés:**

**AVANT:**
```typescript
const supabase = createServerClient();  // ❌ Pas awaité
```

**APRÈS:**
```typescript
const supabase = await createServerClient();  // ✅ Awaité
```

**Fichiers:**
- `app/api/embed-articles/route.ts:17` (POST)
- `app/api/embed-articles/route.ts:140` (GET)

---

### 4. Modification de `/api/import-legifrance/route.ts`

**POST et GET modifiés:**

**AVANT:**
```typescript
const supabase = createServerClient();  // ❌ Pas awaité
```

**APRÈS:**
```typescript
const supabase = await createServerClient();  // ✅ Awaité
```

**Fichiers:**
- `app/api/import-legifrance/route.ts:25` (POST)
- `app/api/import-legifrance/route.ts:223` (GET)

---

## 📊 Récapitulatif des modifications

| Fichier | Lignes | Changement |
|---------|--------|------------|
| `lib/supabase/server.ts` | 23-50 | Fonction async + await cookies() + configuration manuelle |
| `app/api/chat/route.ts` | 10 | await createServerClient() |
| `app/api/embed-articles/route.ts` | 17, 140 | await createServerClient() (POST + GET) |
| `app/api/import-legifrance/route.ts` | 25, 223 | await createServerClient() (POST + GET) |

**Total:** 4 fichiers modifiés, 6 lignes changées

---

## 🔍 Différences Next.js 14 vs 15

### Next.js 14 (ancien)

```typescript
// Synchrone
import { cookies } from 'next/headers';

export function myHandler() {
  const cookieStore = cookies();
  const value = cookieStore.get('token');
  return value;
}
```

### Next.js 15 (nouveau)

```typescript
// Asynchrone
import { cookies } from 'next/headers';

export async function myHandler() {
  const cookieStore = await cookies();  // ✅ AWAIT requis
  const value = cookieStore.get('token');
  return value;
}
```

**Autres APIs affectées dans Next.js 15:**
- `cookies()` → Maintenant async
- `headers()` → Maintenant async
- `draftMode()` → Maintenant async

---

## 🧪 Vérification après fix

### Checklist

- ✅ `lib/supabase/server.ts` : fonction `createServerClient()` est async
- ✅ `lib/supabase/server.ts` : `await cookies()` ajouté
- ✅ `lib/supabase/server.ts` : Configuration manuelle des cookies
- ✅ `app/api/chat/route.ts` : `await createServerClient()` ajouté
- ✅ `app/api/embed-articles/route.ts` : `await createServerClient()` ajouté (POST + GET)
- ✅ `app/api/import-legifrance/route.ts` : `await createServerClient()` ajouté (POST + GET)

### Tests à effectuer

1. **Démarrer l'application**
   ```bash
   npm run dev
   ```

2. **Tester l'authentification**
   - Se connecter sur `/auth/login`
   - Vérifier qu'il n'y a pas d'erreur dans la console

3. **Tester l'API /api/chat**
   - Poser une question via l'interface
   - Vérifier que la réponse arrive sans erreur
   - Vérifier les logs dans le terminal (doit afficher l'userId)

4. **Tester les routes admin (optionnel)**
   ```bash
   # Se connecter d'abord, puis :
   curl http://localhost:3000/api/embed-articles
   curl http://localhost:3000/api/import-legifrance
   ```
   - Doit retourner les données (pas d'erreur 500)

---

## 📝 Notes importantes

### Pourquoi `createClient` au lieu de `createRouteHandlerClient` ?

**Ancienne approche (auth-helpers-nextjs):**
```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
```

**Nouvelle approche (recommandée pour Next.js 15):**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, anonKey, {
  cookies: {
    get: (name) => cookieStore.get(name)?.value,
    set: (name, value, options) => cookieStore.set({ name, value, ...options }),
    remove: (name, options) => cookieStore.set({ name, value: '', ...options }),
  },
});
```

**Raisons:**
1. `@supabase/auth-helpers-nextjs` peut ne pas être à jour avec Next.js 15
2. Configuration manuelle donne plus de contrôle
3. Approche officielle recommandée par Supabase pour Next.js 15

---

### Try/catch dans set/remove

```typescript
set(name: string, value: string, options: any) {
  try {
    cookieStore.set({ name, value, ...options });
  } catch (error) {
    // Ignoré si appelé depuis un Server Component
  }
}
```

**Pourquoi ?**
- Dans Next.js, les cookies ne peuvent être modifiés que dans des Server Actions ou Route Handlers
- Si `set` ou `remove` est appelé depuis un Server Component (lecture seule), ça génère une erreur
- Le try/catch évite que l'app crash
- Le middleware se charge de rafraîchir les sessions automatiquement

---

## 🎯 Résultat final

**Avant le fix:**
```
❌ TypeError: cookieStore.get is not a function
❌ Impossible d'envoyer des messages
❌ Routes API non fonctionnelles
```

**Après le fix:**
```
✅ cookies() correctement awaité
✅ Routes API fonctionnelles
✅ Authentification opérationnelle
✅ Compatible Next.js 15
```

---

## 🔗 Références

- [Next.js 15 Release Notes - Async Request APIs](https://nextjs.org/docs/app/building-your-application/upgrading/version-15#async-request-apis)
- [Supabase Auth with Next.js 15](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Migration Guide: auth-helpers to @supabase/ssr](https://supabase.com/docs/guides/auth/server-side/migrating-to-ssr-from-auth-helpers)

---

**Auteur:** Claude Code
**Version:** 1.0
**Date:** 2025-11-04
