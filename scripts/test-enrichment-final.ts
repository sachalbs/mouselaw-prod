#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testEnrichment() {
  // Prendre les premiers articles avec embedding
  const { data } = await supabase
    .from('code_civil_articles')
    .select('article_number, content')
    .not('embedding', 'is', null)
    .order('article_number')
    .limit(5);

  console.log('🔍 TEST ENRICHISSEMENT (premiers articles avec embedding):\n');

  data?.forEach(a => {
    console.log(`Article ${a.article_number}:`);
    console.log(`  Contenu: ${a.content.substring(0, 250)}...`);
    console.log(`  Enrichi ? ${a.content.includes('Article ' + a.article_number + ' du Code civil') ? 'OUI ✅' : 'NON ❌'}`);
    console.log('');
  });
}

testEnrichment();
