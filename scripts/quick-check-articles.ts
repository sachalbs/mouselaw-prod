/**
 * Quick check: combien d'articles sont dans la base?
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function quickCheck() {
  // Total articles
  const { count: total } = await supabase
    .from('legal_articles')
    .select('*', { count: 'exact', head: true });

  // Articles with embeddings
  const { count: withEmbeddings } = await supabase
    .from('legal_articles')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  // Par code
  const { data: byCodes } = await supabase
    .from('legal_articles')
    .select('code_id, legal_codes(code_name)')
    .order('code_id');

  const codeStats: Record<string, number> = {};
  byCodes?.forEach(row => {
    const codeName = (row as any).legal_codes?.code_name || 'unknown';
    codeStats[codeName] = (codeStats[codeName] || 0) + 1;
  });

  console.log('\n📊 STATISTIQUES ACTUELLES\n');
  console.log(`Total articles: ${total}`);
  console.log(`Avec embeddings: ${withEmbeddings} (${((withEmbeddings! / total!) * 100).toFixed(1)}%)`);
  console.log('\nPar code:');
  Object.entries(codeStats).forEach(([code, count]) => {
    console.log(`  • ${code}: ${count} articles`);
  });
}

quickCheck();
