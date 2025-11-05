#!/usr/bin/env tsx

/**
 * Regenerate ALL embeddings with enriched content
 *
 * WARNING: This script will DELETE all existing articles and embeddings!
 *
 * Steps:
 * 1. Truncate code_civil_articles table
 * 2. Re-import articles from JSON
 * 3. Generate enriched embeddings for all articles
 *
 * Usage:
 *   npx tsx scripts/regenerate-all-embeddings.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import readline from 'readline';

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
 * Ask user for confirmation
 */
function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + ' (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   REGENERATE ALL EMBEDDINGS WITH ENRICHED CONTENT         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Get current database status
  const { count: totalArticles } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true });

  const { count: withEmbeddings } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  console.log('📊 CURRENT DATABASE STATUS:');
  console.log(`   • Total articles: ${totalArticles || 0}`);
  console.log(`   • With embeddings: ${withEmbeddings || 0}\n`);

  // Warning
  console.log('⚠️  WARNING: This will DELETE ALL existing articles and embeddings!\n');
  console.log('This script will:');
  console.log('   1. ❌ Truncate code_civil_articles table (DELETE ALL DATA)');
  console.log('   2. 📥 Re-import articles from data/code-civil-api.json');
  console.log('   3. 🔮 Generate NEW embeddings with enriched content');
  console.log('');
  console.log('💡 Enriched content includes:');
  console.log('   • Article number + title');
  console.log('   • Category labels');
  console.log('   • Full article content');
  console.log('   • Extracted keywords\n');

  // Ask for confirmation
  const confirmed = await askConfirmation('⚠️  Are you ABSOLUTELY SURE you want to proceed?');

  if (!confirmed) {
    console.log('\n❌ Operation cancelled by user\n');
    process.exit(0);
  }

  console.log('\n✅ Confirmed! Starting regeneration process...\n');

  try {
    // Step 1: Truncate table
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: Truncating code_civil_articles table');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { error: deleteError } = await supabase
      .from('code_civil_articles')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

    if (deleteError) {
      throw new Error(`Failed to truncate table: ${deleteError.message}`);
    }

    // Verify deletion
    const { count: afterDelete } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true });

    console.log(`✅ Table truncated successfully`);
    console.log(`   • Articles remaining: ${afterDelete || 0}\n`);

    // Step 2 & 3: Run import-and-embed script
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2 & 3: Importing and generating enriched embeddings');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🚀 Running import-and-embed script...\n');

    // Run the import script
    execSync('npx tsx scripts/import-and-embed.ts', {
      cwd: process.cwd(),
      stdio: 'inherit', // Show output in real-time
    });

    // Final status
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('FINAL STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { count: finalTotal } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true });

    const { count: finalWithEmbeddings } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log('📊 NEW DATABASE STATUS:');
    console.log(`   • Total articles: ${finalTotal || 0}`);
    console.log(`   • With enriched embeddings: ${finalWithEmbeddings || 0}`);
    console.log(`   • Ready for search: ${finalTotal === finalWithEmbeddings ? 'Yes ✅' : 'No ❌'}\n`);

    if (finalTotal === finalWithEmbeddings && finalTotal > 0) {
      console.log('🎉 SUCCESS! All articles have been regenerated with enriched embeddings!\n');
      console.log('💡 The RAG system should now be MUCH more accurate thanks to:');
      console.log('   ✅ Enriched content (article number + title + category + keywords)');
      console.log('   ✅ Hybrid search (exact match + vector similarity)');
      console.log('   ✅ Stricter threshold (0.75) for better precision\n');
    } else {
      console.log('⚠️  Some articles may not have embeddings. Check the logs above.\n');
    }

  } catch (error) {
    console.error('\n❌ Error during regeneration:', error);
    console.error('\n⚠️  The database may be in an inconsistent state.');
    console.error('You may need to run the import script manually:\n');
    console.error('   npx tsx scripts/import-and-embed.ts\n');
    process.exit(1);
  }
}

// Run the script
main();
