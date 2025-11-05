# ✅ FIX : Double insertion + Migration vers @supabase/ssr

**Date:** 2025-11-05
**Problème:** "new row violates row-level security policy for table 'messages'"
**Cause racine:** Double insertion (frontend + API) + Policies RLS non appliquées
**Statut:** ✅ Code corrigé - Reste à appliquer les policies RLS

---

## 🔍 Problème découvert

### Double insertion des messages

Il y avait **DEUX endroits** qui tentaient d'insérer les messages dans Supabase :

#### 1. Frontend (`app/chat/[id]/page.tsx`)

**AVANT (lignes 78-126)** :
```typescript
// ❌ Le frontend insérait directement dans Supabase
const { data: userMsg, error: userError } = await supabase
  .from('messages')
  .insert({
    conversation_id: resolvedParams.id,
    role: 'user',
    content: messageText
  })
  .select()
  .single();

// ... puis appelait l'API ...

// ❌ Puis insérait ENCORE la réponse assistant
const { data: assistantMsg, error: assistantError } = await supabase
  .from('messages')
  .insert({
    conversation_id: resolvedParams.id,
    role: 'assistant',
    content: assistantText
  })
```

#### 2. API (`app/api/chat/route.ts`)

**Code qu'on venait d'ajouter (lignes 152-279)** :
```typescript
// ✅ L'API insère aussi les messages (correct)
const { error: userMessageError } = await supabase
  .from('messages')
  .insert([{
    conversation_id: finalConversationId,
    role: 'user',
    content: message,
  }]);

// ... Appel Mistral ...

const { error: assistantMessageError } = await supabase
  .from('messages')
  .insert([{
    conversation_id: finalConversationId,
    role: 'assistant',
    content: response,
  }]);
```

**Résultat** : Les messages étaient insérés 2 fois !

---

## ✅ Solution appliquée

### 1. Simplification du frontend

Le frontend ne fait PLUS d'insertions directes. Il délègue tout à l'API.

**APRÈS (`app/chat/[id]/page.tsx` lignes 68-114)** :

```typescript
const sendMessage = async (text?: string) => {
  const messageText = text || input;
  if (!messageText.trim() || isLoading) return;

  setInput('');
  setIsLoading(true);
  setError('');

  // ✅ Optimistic UI: Afficher immédiatement le message user
  const tempUserMsg: Message = {
    id: 'temp-' + Date.now(),
    role: 'user',
    content: messageText,
    created_at: new Date().toISOString()
  };
  setMessages(prev => [...prev, tempUserMsg]);

  try {
    // ✅ Appeler l'API - elle gère TOUT
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messageText,
        conversationId: resolvedParams.id
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.details || 'Erreur API');
    }

    // ✅ Recharger les messages depuis la base
    await loadMessages();

  } catch (err: any) {
    // ✅ En cas d'erreur, retirer le message temporaire
    setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    setError(err.message || 'Une erreur est survenue');
    console.error('Erreur:', err);
  } finally {
    setIsLoading(false);
  }
};
```

**Avantages** :
- ✅ Une seule source de vérité (l'API)
- ✅ Optimistic UI : affichage immédiat pour bonne UX
- ✅ Recharge depuis la base pour avoir les vrais IDs
- ✅ Gestion d'erreur propre : retire le message temp si échec
- ✅ Plus de double insertion

---

### 2. Migration vers @supabase/ssr

**AVANT** :
```typescript
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();
```

**APRÈS** :
```typescript
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();
```

**Raison** : `@supabase/auth-helpers-nextjs` est obsolète et incompatible avec Next.js 15.

---

## 🔒 Policies RLS à appliquer

Le code est maintenant correct, mais l'erreur RLS persiste car **les policies RLS ne sont pas appliquées dans la base de données**.

### IMPORTANT : Appliquer la migration SQL

1. **Ouvrir Supabase Dashboard** :
   ```
   https://supabase.com/dashboard/project/jepalfxmujstaomcolrf
   ```

2. **SQL Editor → New query**

3. **Copier TOUT le contenu de** `supabase/migrations/fix_messages_rls.sql`

4. **Coller et exécuter**

5. **Vérifier que les 8 policies sont créées** :
   ```sql
   SELECT tablename, policyname
   FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('messages', 'conversations')
   ORDER BY tablename, policyname;
   ```

Vous devriez voir :
- 4 policies pour `conversations` (SELECT, INSERT, UPDATE, DELETE)
- 4 policies pour `messages` (SELECT, INSERT, UPDATE, DELETE)

---

## 🧪 Test après les changements

### 1. Redémarrer le serveur

```bash
# Si déjà lancé, l'arrêter d'abord
pkill -f "next dev"

# Démarrer
npm run dev
```

### 2. Ouvrir l'app

```
http://localhost:3000/chat
```

### 3. Créer une nouvelle conversation

Cliquer sur "Nouvelle conversation" ou aller sur `/chat/nouvelle-conversation`

### 4. Poser une question

```
Qu'est-ce que l'article 1240 du Code civil ?
```

### 5. Vérifier les logs du terminal

**Si policies RLS appliquées, vous verrez** :

```
🔍 [DEBUG] Session check: { ... }
🔒 [AUTH] User ... authenticated

📝 Création d'une nouvelle conversation...
✅ Conversation créée: [ID] pour user: [USER_ID]

💬 Insertion du message utilisateur...
📊 Données: { conversation_id: '...', ... }
✅ Message utilisateur inséré

💬 Insertion de la réponse assistant...
✅ Réponse assistant insérée

✅ Conversation et messages sauvegardés avec succès
```

**Si policies RLS NON appliquées, vous verrez** :

```
❌ Erreur insertion message utilisateur: {
  message: 'new row violates row-level security policy for table "messages"',
  code: '42501',
  ...
}
```

---

## 📊 Récapitulatif des changements

| Fichier | Changements | Lignes | Statut |
|---------|-------------|--------|--------|
| `app/chat/[id]/page.tsx` | Migration vers `@supabase/ssr` | 4, 27 | ✅ |
| `app/chat/[id]/page.tsx` | Suppression double insertion | 68-114 | ✅ |
| `app/chat/[id]/page.tsx` | Optimistic UI | 76-83 | ✅ |
| `app/chat/[id]/page.tsx` | Rechargement messages après API | 104 | ✅ |
| `app/api/chat/route.ts` | Implémentation insertion messages | 152-279 | ✅ (déjà fait) |
| **Policies RLS** | **À appliquer via Dashboard** | - | ⚠️ **ACTION REQUISE** |

---

## ⚠️ ACTION REQUISE

### Pour que tout fonctionne, vous DEVEZ :

1. **Appliquer les policies RLS** via Supabase Dashboard SQL Editor
2. Utiliser le fichier `supabase/migrations/fix_messages_rls.sql`
3. Vérifier que les 8 policies sont créées
4. Relancer le test

**Sans les policies RLS, l'erreur persistera même avec le code corrigé.**

---

## 🎯 Architecture finale

```
Frontend (app/chat/[id]/page.tsx)
  │
  ├─> Affiche message user (optimistic UI)
  │
  ├─> Appelle API POST /api/chat
  │     │
  │     └─> API (app/api/chat/route.ts)
  │           │
  │           ├─> Vérifie auth
  │           ├─> Crée/récupère conversation
  │           ├─> Insère message user ✅
  │           ├─> Appelle Mistral
  │           ├─> Insère réponse assistant ✅
  │           └─> Retourne conversationId
  │
  └─> Recharge messages depuis Supabase
```

**Une seule source de vérité** : l'API.
**Frontend** : Affichage et interactions uniquement.

---

## 📚 Références

- Code frontend modifié : `app/chat/[id]/page.tsx:68-114`
- Code API : `app/api/chat/route.ts:152-279`
- Migration RLS : `supabase/migrations/fix_messages_rls.sql`
- Documentation complète : `FIX_MESSAGE_INSERTION_COMPLETE.md`

---

**Auteur:** Claude Code
**Version:** 1.0
**Date:** 2025-11-05
**Statut:** ✅ Code corrigé - ⚠️ Policies RLS à appliquer
