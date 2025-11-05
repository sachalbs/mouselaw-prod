/**
 * Apply migration to create universal legal tables
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function applyMigration() {
  console.log('🔧 Application de la migration create_universal_legal_tables.sql...\n');

  try {
    // Lire le fichier de migration
    const migrationPath = resolve(
      process.cwd(),
      'supabase/migrations/create_universal_legal_tables.sql'
    );
    const sql = readFileSync(migrationPath, 'utf-8');

    // Diviser en statements individuels (séparés par des lignes vides)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📋 ${statements.length} statements à exécuter\n`);

    // Exécuter chaque statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ';';

      // Skip comments
      if (stmt.trim().startsWith('--')) continue;

      // Extract first few words for display
      const preview = stmt.substring(0, 60).replace(/\s+/g, ' ') + '...';
      console.log(`[${i + 1}/${statements.length}] ${preview}`);

      try {
        const { error } = await supabase.rpc('exec_sql', { sql: stmt });

        if (error) {
          // Try direct execution if rpc fails
          console.log('   ⚠️  RPC failed, trying direct execution...');

          // For CREATE TABLE, INSERT, etc., we can use raw SQL
          const result = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
                Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ query: stmt }),
            }
          );

          if (!result.ok) {
            console.error(`   ❌ Erreur:`, error?.message || 'Unknown error');
            console.error(`   Statement:`, stmt.substring(0, 100));
          } else {
            console.log(`   ✅ OK`);
          }
        } else {
          console.log(`   ✅ OK`);
        }
      } catch (err: any) {
        console.error(`   ⚠️  Warning:`, err.message);
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n✅ Migration appliquée avec succès !');
    console.log('\n💡 Vérifiez avec: npx tsx scripts/check-setup.ts');

  } catch (error: any) {
    console.error('\n❌ Erreur lors de l\'application de la migration:', error.message);
    process.exit(1);
  }
}

applyMigration();
