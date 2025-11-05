# Application de la migration RLS - Instructions

La migration `fix_messages_rls.sql` doit être appliquée via le Supabase Dashboard car l'API JavaScript ne permet pas d'exécuter du DDL (CREATE POLICY, DROP POLICY, etc.).

## Étapes d'application

### Option 1 : Dashboard Supabase (RECOMMANDÉ)

1. **Ouvrir le Dashboard Supabase**
   ```
   https://supabase.com/dashboard/project/jepalfxmujstaomcolrf
   ```

2. **Naviguer vers SQL Editor**
   - Cliquer sur "SQL Editor" dans le menu de gauche
   - Cliquer sur "New query"

3. **Copier-coller le SQL**
   - Ouvrir le fichier `supabase/migrations/fix_messages_rls.sql`
   - Copier TOUT le contenu
   - Coller dans l'éditeur SQL

4. **Exécuter**
   - Cliquer sur "Run" ou appuyer sur `Ctrl+Enter`
   - Attendre la confirmation "Success. No rows returned"

### Option 2 : psql (si vous avez la connection string)

```bash
psql "postgresql://postgres:[PASSWORD]@db.jepalfxmujstaomcolrf.supabase.co:5432/postgres" < supabase/migrations/fix_messages_rls.sql
```

## Vérification

Après application de la migration, vous pouvez vérifier que les policies sont en place :

```bash
npx tsx scripts/check-db-schema.ts
```

Ou directement dans le Dashboard :
1. SQL Editor → New query
2. Exécuter :
   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('messages', 'conversations')
   ORDER BY tablename, policyname;
   ```

Vous devriez voir :
- 4 policies pour `conversations` (SELECT, INSERT, UPDATE, DELETE)
- 4 policies pour `messages` (SELECT, INSERT, UPDATE, DELETE)

## Test après application

1. Ouvrir http://localhost:3000/chat
2. Créer une nouvelle conversation
3. Poser une question : "Qu'est-ce que l'article 1240 ?"
4. Vérifier qu'il n'y a plus d'erreur "new row violates row-level security policy"
5. Vérifier que la réponse s'affiche correctement

## Contenu de la migration

La migration effectue les actions suivantes :

1. **Active RLS** sur les tables `messages` et `conversations`
2. **Supprime** toutes les anciennes policies (idempotent)
3. **Crée** les nouvelles policies :

   **Conversations :**
   - `SELECT`: Users can view own conversations
   - `INSERT`: Users can insert own conversations
   - `UPDATE`: Users can update own conversations
   - `DELETE`: Users can delete own conversations

   **Messages :**
   - `SELECT`: Users can view messages in own conversations
   - `INSERT`: Users can create messages in own conversations
   - `UPDATE`: Users can update messages in own conversations
   - `DELETE`: Users can delete messages in own conversations

4. **Crée des index** pour optimiser les performances :
   - `idx_messages_conversation_id`
   - `idx_conversations_user_id`

## Que faire en cas d'erreur ?

### Erreur : "policy already exists"
Cela signifie que certaines policies existent déjà. Ce n'est pas grave, la migration utilise `DROP POLICY IF EXISTS` pour être idempotente. Continuez l'exécution.

### Erreur : "permission denied"
Assurez-vous d'être connecté avec un compte admin du projet Supabase.

### Erreur : "table does not exist"
Vérifiez que les tables `messages` et `conversations` existent :
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('messages', 'conversations');
```
