#!/usr/bin/env tsx
/**
 * Script pour vérifier le schéma de la base de données Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TableInfo {
  table_name: string;
  exists: boolean;
  row_count?: number;
  has_rls?: boolean;
}

async function checkTables() {
  console.log('🔍 VÉRIFICATION DU SCHÉMA DE BASE DE DONNÉES\n');
  console.log('═'.repeat(60));
  console.log('📊 TABLES ATTENDUES\n');

  const tablesToCheck = [
    'users_profiles',
    'profiles', // Ancienne table possible
    'conversations',
    'messages',
    'code_civil_articles',
    'legal_articles',
    'case_law',
    'jurisdictions',
    'methodology_resources'
  ];

  const results: TableInfo[] = [];

  for (const tableName of tablesToCheck) {
    try {
      // Test si la table existe en faisant un SELECT COUNT
      const { data, error, count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        if (error.code === '42P01') {
          // Table n'existe pas
          results.push({ table_name: tableName, exists: false });
          console.log(`❌ ${tableName.padEnd(25)} - N'existe pas`);
        } else {
          console.log(`⚠️  ${tableName.padEnd(25)} - Erreur: ${error.message}`);
        }
      } else {
        results.push({
          table_name: tableName,
          exists: true,
          row_count: count || 0
        });
        console.log(`✅ ${tableName.padEnd(25)} - ${count || 0} lignes`);
      }
    } catch (err: any) {
      console.log(`⚠️  ${tableName.padEnd(25)} - Erreur: ${err.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('🔐 VÉRIFICATION DES POLICIES RLS\n');

  // Vérifier les policies RLS via requête SQL
  const { data: policies, error: policiesError } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        ORDER BY tablename, policyname;
      `
    })
    .single();

  if (policiesError) {
    console.log('⚠️  Impossible de récupérer les policies RLS');
    console.log('   (fonction exec_sql non disponible)');
  } else {
    console.log('Policies trouvées:', policies);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('👤 VÉRIFICATION AUTH\n');

  // Vérifier si auth.users existe en testant getUser
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.log('❌ Erreur auth:', authError.message);
  } else {
    console.log(`✅ Supabase Auth fonctionne - ${authData.users.length} utilisateurs`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📋 RÉSUMÉ\n');

  const existingTables = results.filter(r => r.exists);
  const missingTables = results.filter(r => !r.exists);

  console.log(`✅ Tables existantes: ${existingTables.length}`);
  existingTables.forEach(t => {
    console.log(`   - ${t.table_name} (${t.row_count} lignes)`);
  });

  console.log(`\n❌ Tables manquantes: ${missingTables.length}`);
  missingTables.forEach(t => {
    console.log(`   - ${t.table_name}`);
  });

  console.log('\n' + '═'.repeat(60));
}

// Exécuter la vérification
checkTables()
  .then(() => {
    console.log('✅ Vérification terminée');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erreur:', err);
    process.exit(1);
  });
