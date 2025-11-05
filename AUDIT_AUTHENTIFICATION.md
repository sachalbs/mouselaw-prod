# 🔐 Audit Authentification MouseLaw

**Date:** 2025-11-04
**Objectif:** Analyser l'état actuel de l'authentification et identifier les améliorations nécessaires

---

## ✅ Ce qui existe

### 1. Configuration Supabase

**Fichier:** `.env.local`

```env
✅ NEXT_PUBLIC_SUPABASE_URL=https://jepalfxmujstaomcolrf.supabase.co
✅ NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
✅ SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

**État:** Configuration complète et opérationnelle

---

### 2. Pages d'authentification

#### ✅ Deux systèmes de login coexistent :

1. **`/auth/login`** et **`/auth/signup`** (pages séparées)
   - **Login:** `app/auth/login/page.tsx:1-142`
     - Email + mot de passe
     - Gestion d'erreurs
     - Redirection vers `/chat` après connexion

   - **Signup:** `app/auth/signup/page.tsx:1-237`
     - Validation de mot de passe stricte (8 chars, majuscule, minuscule, chiffre)
     - Champ `name` stocké dans `auth.users.metadata`
     - Redirection vers `/chat` après inscription

2. **`/login`** (page unique avec onglets)
   - **Fichier:** `app/login/page.tsx:1-185`
   - Onglets Login/Signup dans la même page
   - Callback OAuth configuré

**⚠️ Problème:** Il y a un doublon entre `/auth/login` et `/login`. Il faut choisir un système unique.

---

### 3. Middleware et protection des routes

**Fichier:** `middleware.ts:1-28`

```typescript
export async function middleware(req: NextRequest) {
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  // Si authentifié et accède /login → redirige vers /chat
  if (session && req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  // Si non authentifié et accède /chat/* → redirige vers /login
  if (!session && req.nextUrl.pathname.startsWith('/chat')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/chat/:path*', '/login'],
};
```

**État:** ✅ Protection des routes `/chat/*` fonctionnelle

---

### 4. Configuration Supabase Client

#### Client-side
**Fichier:** `lib/supabase/client.ts:1-8`
```typescript
export function createClient() {
  return createClientComponentClient();
}
```

#### Server-side
**Fichier:** `lib/supabase/server.ts:1-19`
```typescript
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ⚠️ Temporary user ID for development (before auth is implemented)
export const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';
```

**⚠️ Problème:** Il reste un `TEMP_USER_ID` hardcodé pour le développement !

---

### 5. Schéma de base de données

**Vérification:** `scripts/check-db-schema.ts` exécuté avec succès

#### Tables existantes :

| Table | Lignes | user_id présent ? | RLS activé ? |
|-------|--------|-------------------|--------------|
| `users_profiles` | 0 | ✅ (id UUID → auth.users) | ✅ |
| `profiles` | 0 | ⚠️ (doublon ?) | ❓ |
| `conversations` | 16 | ✅ (user_id UUID) | ✅ |
| `messages` | 38 | ✅ (via conversation_id) | ✅ |
| `code_civil_articles` | 0 | N/A (table publique) | ✅ |
| `legal_articles` | 2840 | N/A (table publique) | ❓ |
| `case_law` | 1017 | N/A (table publique) | ❓ |
| `jurisdictions` | 4 | N/A (table publique) | ❓ |
| `methodology_resources` | 5 | N/A (table publique) | ❓ |

**Supabase Auth:** ✅ 4 utilisateurs enregistrés

#### Schéma complet défini dans `supabase/schema.sql`

**Table `users_profiles`:**
```sql
CREATE TABLE public.users_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  university TEXT,
  year_of_study TEXT CHECK (year_of_study IN ('L1', 'L2', 'L3', 'M1', 'M2', 'Autre')),

  -- Subscription management
  subscription_status TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  -- Usage tracking
  monthly_quota INTEGER NOT NULL DEFAULT 50,
  messages_used INTEGER NOT NULL DEFAULT 0,
  quota_reset_date TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 month'),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**RLS Policies configurées pour:**
- ✅ `users_profiles` (SELECT, UPDATE, INSERT propres à chaque user)
- ✅ `conversations` (SELECT, INSERT, UPDATE, DELETE propres à chaque user)
- ✅ `messages` (SELECT, INSERT, DELETE via conversation_id)
- ✅ `code_civil_articles` (lecture publique pour users authentifiés)

---

### 6. Supabase Auth

**Résultat du script:** ✅ Supabase Auth fonctionne - 4 utilisateurs

---

## ❌ Ce qui manque

### 1. Composants Auth React

**Aucun composant trouvé :**
- ❌ `AuthProvider` (Context React pour gérer l'état d'auth)
- ❌ `useAuth()` hook personnalisé
- ❌ Composant `ProtectedRoute` (HOC)
- ❌ Contexte global pour `user` actuel

**Conséquence:** Chaque page doit gérer l'auth manuellement avec `createClientComponentClient()`

---

### 2. Routes API non protégées

**Fichier:** `app/api/chat/route.ts:1-100`

```typescript
export async function POST(req: NextRequest) {
  try {
    const { message, conversationId } = await req.json();
    // ❌ AUCUNE VÉRIFICATION D'AUTHENTIFICATION !
    // ❌ user_id n'est pas récupéré
    // ❌ N'importe qui peut appeler cette route
```

**⚠️ PROBLÈME CRITIQUE:** Les routes API ne vérifient pas l'authentification !

**Routes à protéger:**
- ❌ `/api/chat`
- ❓ `/api/embed-articles` (admin seulement ?)
- ❓ `/api/import-legifrance` (admin seulement ?)

---

### 3. Gestion de session côté client

**`app/layout.tsx:1-26`** ne contient aucun provider d'auth

```tsx
export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        {children}  {/* ❌ Pas de <AuthProvider> */}
      </body>
    </html>
  );
}
```

---

### 4. Fonctionnalités utilisateur manquantes

- ❌ Page `/profile` pour éditer son profil
- ❌ Déconnexion (bouton logout)
- ❌ Réinitialisation de mot de passe (forgot password)
- ❌ Callback OAuth (`/auth/callback/route.ts`)
- ❌ Upload d'avatar (Supabase Storage)
- ❌ Gestion du quota mensuel (UI)
- ❌ Affichage du nom de l'utilisateur dans l'UI

---

### 5. Problèmes de cohérence

#### Doublon de tables
- ⚠️ `users_profiles` (0 lignes) vs `profiles` (0 lignes) → laquelle utiliser ?

#### Doublon de pages login
- ⚠️ `/auth/login` vs `/login` → quelle route officielle ?

#### TEMP_USER_ID hardcodé
- ⚠️ `lib/supabase/server.ts:19` → à supprimer après implémentation complète

---

### 6. Stripe non intégré

**Variables présentes mais vides:**
```env
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

- ❌ Routes Stripe webhook manquantes
- ❌ Logique de souscription non implémentée
- ❌ Gestion du quota (messages_used) non reliée à l'API

---

### 7. RLS Policies non vérifiables

Le script ne peut pas vérifier les policies RLS via SQL:
```
⚠️  Impossible de récupérer les policies RLS
   (fonction exec_sql non disponible)
```

**Solution:** Créer une fonction SQL personnalisée ou vérifier manuellement dans Supabase Dashboard.

---

## 📋 Plan d'implémentation prioritaire

### 🔴 PRIORITÉ 1 : Sécuriser les routes API (CRITIQUE)

**Fichiers à modifier:**
1. `app/api/chat/route.ts`
   - Ajouter vérification session avec `@supabase/auth-helpers-nextjs`
   - Extraire `user_id` depuis `session.user.id`
   - Lier les conversations créées au `user_id`

**Exemple de code à ajouter:**
```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  // 1. Vérifier l'authentification
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    return NextResponse.json(
      { error: 'Non authentifié' },
      { status: 401 }
    );
  }

  const user_id = session.user.id;

  // 2. Suite de la logique avec user_id...
}
```

---

### 🟠 PRIORITÉ 2 : Unifier le système d'authentification

#### Choix à faire : `/auth/login` OU `/login` ?

**Recommandation:** Utiliser `/auth/*` (plus structuré)

**Actions:**
1. Supprimer `/app/login/page.tsx`
2. Mettre à jour le middleware pour rediriger vers `/auth/login`
3. Mettre à jour les liens dans les composants

---

### 🟡 PRIORITÉ 3 : Créer les composants Auth React

**Fichiers à créer:**

#### 1. `lib/auth/AuthProvider.tsx`
```typescript
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Récupérer la session initiale
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

#### 2. Modifier `app/layout.tsx`
```typescript
import { AuthProvider } from '@/lib/auth/AuthProvider';

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

### 🟢 PRIORITÉ 4 : Fonctionnalités utilisateur essentielles

#### 1. Page de profil

**Fichier:** `app/profile/page.tsx`
- Afficher email, full_name, university, year_of_study
- Formulaire d'édition avec validation
- Affichage du quota mensuel (`monthly_quota` - `messages_used`)

#### 2. Bouton de déconnexion

**Ajouter dans:** `components/chat/ConversationSidebar.tsx` ou `components/Header.tsx`
```typescript
import { useAuth } from '@/lib/auth/AuthProvider';

export function UserMenu() {
  const { user, signOut } = useAuth();

  return (
    <button onClick={signOut}>
      Déconnexion ({user?.email})
    </button>
  );
}
```

#### 3. Réinitialisation de mot de passe

**Créer:** `app/auth/reset-password/page.tsx`
```typescript
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/update-password`,
});
```

**Créer:** `app/auth/update-password/page.tsx`

---

### 🔵 PRIORITÉ 5 : Callback OAuth

**Créer:** `app/auth/callback/route.ts`
```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(requestUrl.origin + '/chat');
}
```

---

### ⚪ PRIORITÉ 6 : Fonctionnalités avancées (optionnelles)

- Upload d'avatar via Supabase Storage
- OAuth Google/GitHub
- Vérification email obligatoire
- Profils étudiants enrichis (spécialité, niveau)
- Historique de consommation du quota

---

## 🎯 Résumé des actions immédiates

### Aujourd'hui (critique)
1. ✅ Audit complet terminé
2. 🔴 Protéger `/api/chat` avec authentification
3. 🔴 Extraire `user_id` et lier les conversations

### Cette semaine
4. 🟠 Choisir et unifier `/auth/login` ou `/login`
5. 🟡 Créer `AuthProvider` + hook `useAuth()`
6. 🟡 Ajouter bouton déconnexion
7. 🟢 Créer page `/profile`

### Mois prochain
8. 🔵 Implémenter callback OAuth
9. 🔵 Réinitialisation de mot de passe
10. ⚪ Intégration Stripe pour abonnements

---

## 🔍 Points de vigilance

### 1. TEMP_USER_ID à supprimer
**Fichier:** `lib/supabase/server.ts:19`
```typescript
// ⚠️ À SUPPRIMER après implémentation auth complète
export const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';
```

**Impact:** Toutes les conversations actuelles (16 lignes) utilisent probablement ce TEMP_USER_ID.

**Action:** Vérifier avec une requête SQL :
```sql
SELECT user_id, COUNT(*)
FROM conversations
GROUP BY user_id;
```

---

### 2. Table `profiles` vs `users_profiles`

**Constat:** Les deux existent avec 0 lignes.

**Action:** Décider laquelle garder, supprimer l'autre, et mettre à jour les références.

---

### 3. Vérifier les RLS Policies manuellement

**Dashboard Supabase → Authentication → Policies**

Vérifier que toutes les policies définies dans `supabase/schema.sql` sont bien actives.

---

### 4. Migration des données existantes

**Après sécurisation de l'API:**
- Les 16 conversations existantes sont liées au `TEMP_USER_ID`
- Si ce compte n'existe pas dans `auth.users`, ces conversations seront inaccessibles
- **Solution:** Créer un vrai compte admin avec cet UUID, ou réattribuer les conversations

---

## 📊 Métriques de sécurité

| Composant | État | Priorité |
|-----------|------|----------|
| Configuration Supabase | ✅ Complet | - |
| Pages Login/Signup | ✅ Fonctionnel | 🟠 Dédupliquer |
| Middleware protection | ✅ Actif | - |
| RLS Policies (schéma) | ✅ Défini | 🔍 Vérifier activé |
| API Routes protection | ❌ Non sécurisé | 🔴 CRITIQUE |
| AuthProvider React | ❌ Manquant | 🟡 Important |
| Profil utilisateur | ❌ Manquant | 🟢 Nice-to-have |
| Réinitialisation MDP | ❌ Manquant | 🔵 Optionnel |
| OAuth callback | ❌ Manquant | 🔵 Optionnel |

---

## ✅ Conclusion

**État général:** 60% complet

**Points forts:**
- ✅ Schéma de base de données bien conçu avec RLS
- ✅ Pages d'authentification fonctionnelles
- ✅ Middleware de protection des routes actif
- ✅ Configuration Supabase complète

**Points bloquants:**
- 🔴 **CRITIQUE:** Routes API non protégées (n'importe qui peut envoyer des messages)
- 🟠 **Important:** Pas de gestion centralisée de l'état d'auth (AuthProvider)
- 🟡 **Gênant:** Doublons (pages login, tables profiles)

**Effort estimé pour compléter:**
- Priorité 1 (sécurité API) : 2-4 heures
- Priorité 2 (unification) : 1-2 heures
- Priorité 3 (AuthProvider) : 3-5 heures
- Priorité 4 (profil + logout) : 2-3 heures
- **Total MVP sécurisé:** 8-14 heures de développement

---

**Prochaine étape recommandée:** Commencer par la PRIORITÉ 1 (sécuriser `/api/chat`) immédiatement.
