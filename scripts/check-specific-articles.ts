#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkArticles() {
  const articlesToCheck = ['1240', '1241', '1242', '1243'];

  console.log('🔍 Vérification des articles de responsabilité civile:\\n');

  for (const articleNum of articlesToCheck) {
    const { data, error } = await supabase
      .from('code_civil_articles')
      .select('article_number, embedding')
      .eq('article_number', articleNum)
      .single();

    if (error) {
      console.log(`❌ Article ${articleNum}: Erreur - ${error.message}`);
      continue;
    }

    const hasEmbedding = data?.embedding !== null && data?.embedding !== undefined;
    console.log(`${hasEmbedding ? '✅' : '❌'} Article ${articleNum}: ${hasEmbedding ? 'EMBEDÉ' : 'Pas encore embedé'}`);
  }

  console.log('\\n');
}

checkArticles().catch(console.error);
