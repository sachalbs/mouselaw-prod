import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Charger explicitement .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('code_civil_articles')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Erreur:', error);
  } else if (data && data.length > 0) {
    console.log('Colonnes disponibles:', Object.keys(data[0]));
    console.log('\nExemple d\'article:', data[0]);
  } else {
    console.log('Table vide');
  }
}

checkSchema();
