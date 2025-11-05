/**
 * Bootstrap script: Create universal legal tables
 * Run this ONCE before using import-all-codes.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LegalCode {
  code_name: string;
  full_name: string;
  legifrance_id: string;
  description: string;
}

const CODES: LegalCode[] = [
  {
    code_name: 'code_civil',
    full_name: 'Code Civil',
    legifrance_id: 'LEGITEXT000006070721',
    description: 'Régit les relations entre personnes privées',
  },
  {
    code_name: 'code_penal',
    full_name: 'Code Pénal',
    legifrance_id: 'LEGITEXT000006070719',
    description: 'Définit les infractions et les peines',
  },
  {
    code_name: 'code_travail',
    full_name: 'Code du Travail',
    legifrance_id: 'LEGITEXT000006072050',
    description: 'Régit les relations de travail',
  },
  {
    code_name: 'code_commerce',
    full_name: 'Code de Commerce',
    legifrance_id: 'LEGITEXT000005634379',
    description: 'Régit les actes de commerce et les commerçants',
  },
  {
    code_name: 'code_procedure_civile',
    full_name: 'Code de Procédure Civile',
    legifrance_id: 'LEGITEXT000006070716',
    description: 'Règles de procédure devant les juridictions civiles',
  },
  {
    code_name: 'code_procedure_penale',
    full_name: 'Code de Procédure Pénale',
    legifrance_id: 'LEGITEXT000006071154',
    description: 'Règles de procédure pénale',
  },
];

async function bootstrap() {
  console.log('🚀 BOOTSTRAP: Création des tables universelles\n');
  console.log('='.repeat(70));

  try {
    // Étape 1: Insérer les codes juridiques
    console.log('\n📚 Insertion des 6 codes juridiques...');

    for (const code of CODES) {
      const { error } = await supabase
        .from('legal_codes')
        .upsert([code], {
          onConflict: 'code_name',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`   ❌ Erreur insertion ${code.code_name}:`, error.message);
      } else {
        console.log(`   ✅ ${code.full_name}`);
      }
    }

    // Étape 2: Vérifier les tables
    console.log('\n🔍 Vérification des tables...');

    const { data: codes, error: codesError } = await supabase
      .from('legal_codes')
      .select('*')
      .order('code_name');

    if (codesError) {
      throw new Error(`Erreur lecture legal_codes: ${codesError.message}`);
    }

    console.log(`   ✅ legal_codes: ${codes?.length || 0} codes trouvés`);

    const { count: articlesCount, error: articlesError } = await supabase
      .from('legal_articles')
      .select('*', { count: 'exact', head: true });

    if (articlesError) {
      throw new Error(`Erreur lecture legal_articles: ${articlesError.message}`);
    }

    console.log(`   ✅ legal_articles: ${articlesCount || 0} articles existants`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ BOOTSTRAP TERMINÉ !');
    console.log('='.repeat(70));

    console.log('\n📊 Codes disponibles:');
    codes?.forEach(code => {
      console.log(`   • ${code.code_name} (${code.legifrance_id})`);
    });

    console.log('\n🚀 Prêt pour l\'import !');
    console.log('   Commande: npx tsx scripts/import-all-codes.ts\n');

  } catch (error: any) {
    console.error('\n❌ ERREUR:', error.message);
    console.error('\n💡 SOLUTION:');
    console.error('   1. Assurez-vous que les tables existent dans Supabase');
    console.error('   2. Appliquez la migration: supabase/migrations/create_universal_legal_tables.sql');
    console.error('   3. Ou créez les tables manuellement via le SQL Editor de Supabase');
    process.exit(1);
  }
}

bootstrap();
