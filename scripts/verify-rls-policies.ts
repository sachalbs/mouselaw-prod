/**
 * Verify that RLS policies are correctly applied to messages and conversations tables
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyPolicies() {
  console.log('🔍 Vérification des policies RLS...\n');

  try {
    // Check if RLS is enabled on tables
    const { data: rlsCheck, error: rlsError } = await supabase
      .from('pg_tables')
      .select('tablename, rowsecurity')
      .in('tablename', ['messages', 'conversations'])
      .eq('schemaname', 'public');

    if (rlsError) {
      console.log('⚠️  Impossible de vérifier le statut RLS via l\'API');
      console.log('   Utilisez le Dashboard Supabase pour vérifier manuellement\n');
    }

    // Expected policies
    const expectedPolicies = {
      conversations: [
        'Users can view own conversations',
        'Users can insert own conversations',
        'Users can update own conversations',
        'Users can delete own conversations',
      ],
      messages: [
        'Users can view messages in own conversations',
        'Users can create messages in own conversations',
        'Users can update messages in own conversations',
        'Users can delete messages in own conversations',
      ],
    };

    console.log('📋 Policies attendues :\n');
    console.log('Table: conversations');
    expectedPolicies.conversations.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p}`);
    });
    console.log('\nTable: messages');
    expectedPolicies.messages.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('⚠️  VÉRIFICATION MANUELLE REQUISE');
    console.log('='.repeat(80));
    console.log('\nL\'API Supabase ne permet pas de lire les policies via JavaScript.');
    console.log('Pour vérifier que les policies sont correctement appliquées :\n');
    console.log('1. Ouvrir le Dashboard Supabase :');
    console.log('   https://supabase.com/dashboard/project/jepalfxmujstaomcolrf\n');
    console.log('2. SQL Editor → New query\n');
    console.log('3. Exécuter cette requête :\n');
    console.log('   SELECT schemaname, tablename, policyname, cmd');
    console.log('   FROM pg_policies');
    console.log('   WHERE schemaname = \'public\' AND tablename IN (\'messages\', \'conversations\')');
    console.log('   ORDER BY tablename, policyname;\n');
    console.log('4. Vérifier que vous voyez 8 policies au total (4 par table)\n');

    // Test basic table access
    console.log('🧪 Test d\'accès basique aux tables...\n');

    try {
      const { count: convCount, error: convError } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });

      if (convError) {
        console.log('❌ Erreur accès conversations:', convError.message);
      } else {
        console.log(`✅ Table conversations accessible (${convCount || 0} lignes)`);
      }
    } catch (err: any) {
      console.log('❌ Erreur conversations:', err.message);
    }

    try {
      const { count: msgCount, error: msgError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });

      if (msgError) {
        console.log('❌ Erreur accès messages:', msgError.message);
      } else {
        console.log(`✅ Table messages accessible (${msgCount || 0} lignes)`);
      }
    } catch (err: any) {
      console.log('❌ Erreur messages:', err.message);
    }

    console.log('\n💡 Pour tester complètement :');
    console.log('   1. Démarrer l\'app: npm run dev');
    console.log('   2. Ouvrir http://localhost:3000/chat');
    console.log('   3. Créer une conversation et envoyer un message');
    console.log('   4. Vérifier qu\'il n\'y a plus d\'erreur RLS\n');

  } catch (error: any) {
    console.error('\n❌ Erreur:', error.message);
    process.exit(1);
  }
}

verifyPolicies();
