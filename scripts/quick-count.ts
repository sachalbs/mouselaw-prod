#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function quickCount() {
  const { count, error } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Embeddings: ${count}/3355 (${((count! / 3355) * 100).toFixed(1)}%)`);
}

quickCount().catch(console.error);
