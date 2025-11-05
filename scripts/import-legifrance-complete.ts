#!/usr/bin/env tsx

/**
 * Import complete Code civil from Légifrance PISTE API
 *
 * This script:
 * 1. Authenticates with PISTE OAuth2
 * 2. Fetches ALL Code civil articles from Légifrance API
 * 3. Saves to data/code-civil-api.json
 * 4. Shows preview of first 3 articles
 *
 * Usage:
 *   npx tsx scripts/import-legifrance-complete.ts          # Full import
 *   npx tsx scripts/import-legifrance-complete.ts --test   # Test connection only
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { testConnection, fetchCodeCivilArticles } from '@/lib/legifrance-api';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Parse command line arguments
const args = process.argv.slice(2);
const isTest = args.includes('--test');

const OUTPUT_FILE = path.join(process.cwd(), 'data', 'code-civil-api.json');

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Mouse Law - Code Civil Import from PISTE API         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Check credentials
    const clientId = process.env.LEGIFRANCE_CLIENT_ID;
    const clientSecret = process.env.LEGIFRANCE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ Missing LEGIFRANCE credentials in .env.local\n');
      console.error('Please add:');
      console.error('   LEGIFRANCE_CLIENT_ID=your_client_id');
      console.error('   LEGIFRANCE_CLIENT_SECRET=your_client_secret\n');
      process.exit(1);
    }

    console.log('✅ Credentials found in .env.local\n');
    console.log('📝 Configuration:');
    console.log(`   Client ID: ${clientId.substring(0, 8)}...`);
    console.log(`   Output file: ${OUTPUT_FILE}\n`);

    // Test connection
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  🧪 TESTING CONNECTION                     ');
    console.log('═══════════════════════════════════════════════════════════\n');

    const connectionOk = await testConnection();

    if (!connectionOk) {
      console.error('\n❌ Connection test failed!');
      console.error('   Please check your credentials and try again.\n');
      process.exit(1);
    }

    if (isTest) {
      console.log('\n✅ Connection test successful!');
      console.log('   You can now run without --test to import articles.\n');
      return;
    }

    // Fetch articles
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  📥 FETCHING ARTICLES                      ');
    console.log('═══════════════════════════════════════════════════════════\n');

    const articles = await fetchCodeCivilArticles((current, total, message) => {
      process.stdout.write(`\r   Progress: ${current}/${total} - ${message}` + ' '.repeat(20));
    });

    console.log('\n');

    if (articles.length === 0) {
      console.log('⚠️  No articles found!');
      console.log('   The API may have returned only the structure without content.');
      console.log('   This is a known limitation of the Légifrance PISTE API.\n');
      return;
    }

    // Save to file
    console.log('💾 Saving articles to JSON file...');

    const output = { articles };

    // Ensure data directory exists
    const dataDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

    // Display results
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  📊 IMPORT RESULTS                         ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total articles fetched: ${articles.length}`);
    console.log(`   • Output file: ${OUTPUT_FILE}`);
    console.log(`   • File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB\n`);

    // Count by category
    const categoryCounts: Record<string, number> = {};
    articles.forEach(article => {
      categoryCounts[article.categorie] = (categoryCounts[article.categorie] || 0) + 1;
    });

    console.log('   Articles by category:');
    Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`      • ${category}: ${count} articles`);
      });

    // Show first 3 articles for verification
    if (articles.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('                  🔍 SAMPLE ARTICLES                        ');
      console.log('═══════════════════════════════════════════════════════════\n');

      articles.slice(0, 3).forEach((article, index) => {
        console.log(`${index + 1}. Article ${article.numero} - ${article.titre}`);
        console.log(`   Catégorie: ${article.categorie}`);
        console.log(`   Livre: ${article.livre}`);
        console.log(`   Section: ${article.section}`);
        console.log(`   Texte: ${article.texte.substring(0, 150)}...`);
        console.log('');
      });
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🎉 Import complete!\n');
    console.log('Next steps:');
    console.log('   1. Verify the articles in the JSON file');
    console.log('   2. Run: npx tsx scripts/import-and-embed.ts');
    console.log('      (Update the script to use code-civil-api.json)');
    console.log('   3. Generate embeddings for vector search\n');

  } catch (error: any) {
    console.error('\n❌ Error during import:', error.message);

    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Error details:`, error.response.data);
    }

    console.error('\nTroubleshooting:');
    console.error('   1. Verify your credentials are correct');
    console.error('   2. Check that your PISTE application is activated');
    console.error('   3. Ensure you have access to "Légifrance Beta" API');
    console.error('   4. Try again in a few minutes (rate limits)\n');

    process.exit(1);
  }
}

// Run the script
main();
