#!/usr/bin/env npx tsx

/**
 * Script simple pour vérifier la structure de la table case_law
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('\n📊 STRUCTURE DE LA TABLE case_law\n');

  // Récupérer une ligne pour voir les colonnes
  const { data, error } = await supabase
    .from('case_law')
    .select('*')
    .not('embedding', 'is', null)
    .limit(1)
    .single();

  if (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('⚠️  Aucune donnée trouvée');
    process.exit(1);
  }

  console.log('✅ Exemple de ligne :\n');
  console.log(JSON.stringify(data, null, 2));

  console.log('\n📋 COLONNES DISPONIBLES :\n');
  Object.keys(data).forEach((key, idx) => {
    const value = data[key];
    const type = Array.isArray(value) ? 'array' : typeof value;
    const preview = type === 'string' && value.length > 50
      ? value.substring(0, 50) + '...'
      : type === 'array'
      ? `[${value.length} items]`
      : value;

    console.log(`   ${idx + 1}. ${key} (${type})`);
    if (key !== 'embedding') {
      console.log(`      ${preview}`);
    }
  });

  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ ERREUR:', err);
    process.exit(1);
  });
