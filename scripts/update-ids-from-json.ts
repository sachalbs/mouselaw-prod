#!/usr/bin/env tsx

/**
 * Update legifrance_id from local JSON file
 *
 * Simple script that reads data/code-civil-api.json and updates Supabase
 * No API calls needed - IDs are already in the JSON!
 *
 * Usage:
 *   npx tsx scripts/update-ids-from-json.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateIds() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('      UPDATE LÉGIFRANCE IDS FROM LOCAL JSON FILE          ');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Read JSON file
  console.log('📖 Reading code-civil-api.json...');
  const jsonPath = path.join(process.cwd(), 'data', 'code-civil-api.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('❌ File not found: data/code-civil-api.json');
    console.error('   Make sure the file exists in the data/ folder');
    process.exit(1);
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const articles = jsonData.articles || [];

  console.log(`✅ Found ${articles.length} articles with IDs in JSON\n`);

  if (articles.length === 0) {
    console.error('❌ No articles found in JSON');
    process.exit(1);
  }

  // Check sample article has ID
  const sampleArticle = articles.find((a: any) => a.id);
  if (!sampleArticle) {
    console.error('❌ Articles in JSON do not have "id" field');
    console.error('   Expected format: { numero, titre, texte, id, ... }');
    process.exit(1);
  }

  console.log(`📝 Sample article ID: ${sampleArticle.id}`);
  console.log(`   Article ${sampleArticle.numero}\n`);

  console.log('🔄 Updating Supabase...\n');

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    if (!article.id || !article.numero) {
      continue;
    }

    try {
      const { error } = await supabase
        .from('code_civil_articles')
        .update({ legifrance_id: article.id })
        .eq('article_number', article.numero);

      if (error) {
        notFound++;
        if (notFound <= 5) {
          console.log(`   ⚠️  Article ${article.numero} not found in Supabase`);
        }
      } else {
        updated++;
      }

      if ((i + 1) % 100 === 0) {
        console.log(`   Progress: ${i + 1}/${articles.length} (${(((i + 1) / articles.length) * 100).toFixed(1)}%)`);
      }
    } catch (err: any) {
      errors++;
      if (errors <= 5) {
        console.error(`   ❌ Error updating article ${article.numero}:`, err.message);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                  ✅ UPDATE COMPLETED                      ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   • Total in JSON: ${articles.length}`);
  console.log(`   • Successfully updated: ${updated}`);
  console.log(`   • Not found in Supabase: ${notFound}`);
  console.log(`   • Errors: ${errors}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (updated > 0) {
    console.log('🎉 Done! You can now test the Légifrance links in the chat.');
    console.log('   Links will now point to specific articles instead of the homepage.\n');
  } else {
    console.log('⚠️  No articles were updated. Check that:');
    console.log('   1. Articles exist in Supabase (code_civil_articles table)');
    console.log('   2. Article numbers match between JSON and Supabase');
  }
}

updateIds()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
