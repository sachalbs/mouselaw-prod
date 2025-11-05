#!/usr/bin/env tsx

/**
 * Test script to verify Code civil import
 *
 * This script:
 * 1. Counts total articles in database
 * 2. Counts articles with/without embeddings
 * 3. Displays first 3 articles for verification
 *
 * Usage:
 *   npx tsx scripts/test-import.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         Mouse Law - Import Verification Test             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Count total articles
    const { count: totalCount, error: totalError } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      throw totalError;
    }

    // Count articles with embeddings
    const { count: embeddedCount, error: embeddedError } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (embeddedError) {
      throw embeddedError;
    }

    const needsEmbedding = (totalCount || 0) - (embeddedCount || 0);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  📊 DATABASE STATUS                        ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total articles in database: ${totalCount || 0}`);
    console.log(`   • Articles with embeddings: ${embeddedCount || 0}`);
    console.log(`   • Articles without embeddings: ${needsEmbedding}`);
    console.log(
      `   • Ready for vector search: ${needsEmbedding === 0 ? 'Yes ✅' : 'No ❌'}`
    );

    if (totalCount && totalCount > 0) {
      const completionPercentage = ((embeddedCount || 0) / totalCount) * 100;
      console.log(`   • Completion: ${completionPercentage.toFixed(1)}%`);
    }

    // Fetch first 3 articles for verification
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  🔍 SAMPLE ARTICLES                        ');
    console.log('═══════════════════════════════════════════════════════════\n');

    const { data: sampleArticles, error: sampleError } = await supabase
      .from('code_civil_articles')
      .select('article_number, title, content, category, embedding')
      .order('article_number')
      .limit(3);

    if (sampleError) {
      throw sampleError;
    }

    if (sampleArticles && sampleArticles.length > 0) {
      sampleArticles.forEach((article, index) => {
        const hasEmbedding = article.embedding ? '✅' : '❌';
        console.log(`${index + 1}. Article ${article.article_number} - ${article.title}`);
        console.log(`   Catégorie: ${article.category}`);
        console.log(`   Embedding: ${hasEmbedding}`);
        console.log(`   Contenu: ${article.content.substring(0, 100)}...`);
        console.log('');
      });
    } else {
      console.log('   No articles found in database.\n');
    }

    // Check by category
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  📂 ARTICLES BY CATEGORY                   ');
    console.log('═══════════════════════════════════════════════════════════\n');

    const { data: categories, error: categoriesError } = await supabase
      .from('code_civil_articles')
      .select('category')
      .order('category');

    if (categoriesError) {
      throw categoriesError;
    }

    if (categories && categories.length > 0) {
      // Count articles per category
      const categoryCounts = categories.reduce((acc: Record<string, number>, article) => {
        const cat = article.category || 'unknown';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});

      // Sort by count descending
      const sortedCategories = Object.entries(categoryCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10); // Top 10 categories

      sortedCategories.forEach(([category, count]) => {
        console.log(`   • ${category}: ${count} articles`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    if (needsEmbedding > 0) {
      console.log('⚠️  Some articles are missing embeddings.');
      console.log('   Run: npx tsx scripts/import-and-embed.ts (without --skip-embeddings)');
      console.log('   to generate embeddings for all articles.\n');
    } else if (totalCount && totalCount > 0) {
      console.log('✅ All articles have embeddings! Vector search is ready.\n');
    } else {
      console.log('⚠️  No articles found in database.');
      console.log('   Run: npx tsx scripts/import-and-embed.ts');
      console.log('   to import articles from data/code-civil-complet.json\n');
    }
  } catch (error) {
    console.error('\n❌ Error during verification:', error);
    process.exit(1);
  }
}

// Run the script
main();
