# 🚨 ACTION IMMÉDIATE REQUISE : Appliquer les policies RLS

**L'application ne fonctionnera PAS tant que les policies RLS ne sont pas appliquées.**

---

## 📋 Checklist rapide

- [ ] Ouvrir Supabase Dashboard
- [ ] Aller dans SQL Editor
- [ ] Copier-coller le SQL ci-dessous
- [ ] Exécuter
- [ ] Tester l'application

**Temps estimé : 2 minutes**

---

## 🔧 ÉTAPE 1 : Ouvrir le Dashboard Supabase

Cliquez sur ce lien :

```
https://supabase.com/dashboard/project/jepalfxmujstaomcolrf/sql/new
```

Ou manuellement :
1. Aller sur https://supabase.com/dashboard
2. Sélectionner le projet "jepalfxmujstaomcolrf"
3. Dans le menu de gauche : **SQL Editor**
4. Cliquer sur **New query**

---

## 🔧 ÉTAPE 2 : Copier ce SQL

**Option A : Copier depuis ce fichier**

Ouvrez `supabase/migrations/fix_messages_rls.sql` et copiez TOUT le contenu.

**Option B : Copier depuis ici**

```sql
-- ============================================================================
-- FIX: RLS Policies pour table messages
-- Date: 2025-11-04
-- Problème: "new row violates row-level security policy for table 'messages'"
-- ============================================================================

-- 1. Activer RLS sur les tables (si pas déjà fait)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- 2. Supprimer les anciennes policies (idempotent)
DROP POLICY IF EXISTS "Users can view messages in own conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in own conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages in own conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages in own conversations" ON public.messages;

DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.conversations;

-- ============================================================================
-- POLICIES CONVERSATIONS
-- ============================================================================

-- SELECT: Users can view their own conversations
CREATE POLICY "Users can view own conversations"
  ON public.conversations
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: Users can create their own conversations
CREATE POLICY "Users can insert own conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can update their own conversations
CREATE POLICY "Users can update own conversations"
  ON public.conversations
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Users can delete their own conversations
CREATE POLICY "Users can delete own conversations"
  ON public.conversations
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- POLICIES MESSAGES
-- ============================================================================

-- SELECT: Users can view messages in their own conversations
CREATE POLICY "Users can view messages in own conversations"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

-- INSERT: Users can create messages in their own conversations
CREATE POLICY "Users can create messages in own conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

-- UPDATE: Users can update messages in their own conversations
CREATE POLICY "Users can update messages in own conversations"
  ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

-- DELETE: Users can delete messages in their own conversations
CREATE POLICY "Users can delete messages in own conversations"
  ON public.messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

-- ============================================================================
-- INDEXES (si pas déjà créés)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
```

---

## 🔧 ÉTAPE 3 : Coller et exécuter

1. **Coller** le SQL dans l'éditeur
2. Cliquer sur **Run** (ou appuyer sur `Ctrl+Enter` / `Cmd+Enter`)
3. Attendre le message **"Success. No rows returned"**

---

## 🔧 ÉTAPE 4 : Vérifier que ça a marché

Dans le même SQL Editor, exécutez cette requête pour vérifier :

```sql
SELECT
  tablename,
  policyname,
  cmd as "operation"
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('messages', 'conversations')
ORDER BY tablename, policyname;
```

**Résultat attendu** : Vous devriez voir **8 policies** :

| tablename      | policyname                                          | operation |
|----------------|-----------------------------------------------------|-----------|
| conversations  | Users can delete own conversations                  | DELETE    |
| conversations  | Users can insert own conversations                  | INSERT    |
| conversations  | Users can update own conversations                  | UPDATE    |
| conversations  | Users can view own conversations                    | SELECT    |
| messages       | Users can create messages in own conversations      | INSERT    |
| messages       | Users can delete messages in own conversations      | DELETE    |
| messages       | Users can update messages in own conversations      | UPDATE    |
| messages       | Users can view messages in own conversations        | SELECT    |

---

## 🧪 ÉTAPE 5 : Tester l'application

1. **Ouvrir** http://localhost:3000/chat

2. **Poser une question** :
   ```
   Qu'est-ce que l'article 1240 du Code civil ?
   ```

3. **Vérifier** :
   - ✅ La réponse s'affiche
   - ✅ AUCUNE erreur "new row violates row-level security policy"
   - ✅ Le message est sauvegardé dans la base

---

## ❓ En cas de problème

### Erreur : "permission denied"

**Solution** : Vous devez être connecté en tant qu'admin du projet Supabase.

---

### Erreur : "policy already exists"

**Solution** : C'est normal ! Le script utilise `DROP POLICY IF EXISTS` donc c'est idempotent. Continuez l'exécution.

---

### Erreur persiste après application

**Solution** :

1. Vérifier que les 8 policies sont bien créées (requête de vérification ci-dessus)

2. Vider les cookies du navigateur :
   - F12 → Application → Clear site data
   - Ou utiliser navigation privée

3. Se reconnecter à l'application

4. Retester

---

## 🎯 Pourquoi c'est important ?

Les **Row Level Security (RLS) policies** contrôlent qui peut accéder à quoi dans Supabase.

Sans ces policies :
- ❌ Supabase REFUSE toutes les insertions (sécurité par défaut)
- ❌ Erreur : "new row violates row-level security policy"
- ❌ L'application ne fonctionne pas

Avec ces policies :
- ✅ Les utilisateurs peuvent créer leurs propres conversations
- ✅ Les utilisateurs peuvent voir/modifier UNIQUEMENT leurs propres messages
- ✅ Sécurité : Impossible d'accéder aux messages d'autres utilisateurs
- ✅ L'application fonctionne !

---

## 📊 Ce que font les policies

### Conversations

- **SELECT** : Voir seulement MES conversations
- **INSERT** : Créer seulement des conversations pour MOI
- **UPDATE** : Modifier seulement MES conversations
- **DELETE** : Supprimer seulement MES conversations

### Messages

- **SELECT** : Voir seulement les messages de MES conversations
- **INSERT** : Créer seulement des messages dans MES conversations
- **UPDATE** : Modifier seulement les messages de MES conversations
- **DELETE** : Supprimer seulement les messages de MES conversations

**Tout est vérifié automatiquement via `auth.uid()` = l'ID de l'utilisateur connecté.**

---

**🚀 Allez-y ! Appliquez les policies maintenant, ça prend 2 minutes !**
