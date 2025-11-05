#!/usr/bin/env tsx

/**
 * Fetch complete Code civil from Légifrance API
 *
 * This script downloads ALL articles from the Code civil (~2500 articles)
 * and saves them to data/code-civil-complet.json
 *
 * Usage:
 *   npx tsx scripts/fetch-full-code-civil.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fetchCodeCivilArticles } from '@/lib/legifrance/client';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const OUTPUT_FILE = path.join(process.cwd(), 'data', 'code-civil-complet.json');

interface JsonArticle {
  numero: string;
  titre: string;
  texte: string;
  section: string;
  livre: string;
  categorie: string;
}

/**
 * Map Légifrance article to JSON format
 */
function mapArticleToJson(article: any): JsonArticle {
  // Extract category from article number or title
  let categorie = 'general';
  const num = parseInt(article.article_number);

  if (num >= 1240 && num <= 1245) categorie = 'responsabilite';
  else if (num >= 1100 && num <= 1231) categorie = 'contrats';
  else if (num >= 144 && num <= 227) categorie = 'mariage';
  else if (num >= 229 && num <= 310) categorie = 'divorce';
  else if (num >= 544 && num <= 710) categorie = 'propriete';
  else if (num >= 721 && num <= 892) categorie = 'successions';
  else if (num >= 1582 && num <= 1701) categorie = 'vente';
  else if (num >= 1101 && num <= 1171) categorie = 'obligations';
  else if (num >= 1382 && num <= 1386) categorie = 'responsabilite'; // old numbering
  else if (num >= 371 && num <= 387) categorie = 'famille';
  else if (num >= 205 && num <= 211) categorie = 'famille';
  else if (num >= 1400 && num <= 1581) categorie = 'regime_matrimonial';
  else if (num >= 893 && num <= 1099) categorie = 'liberalites';

  return {
    numero: article.article_number,
    titre: article.title || '',
    texte: article.content || '',
    section: article.category || '',
    livre: article.book || '',
    categorie: categorie
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║    Fetching Complete Code Civil from Légifrance API      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    console.log('🔗 Connecting to Légifrance API...\n');

    // Fetch all articles
    const articles = await fetchCodeCivilArticles((current, total, message) => {
      process.stdout.write(`\r   Progress: ${current}/${total} - ${message}` + ' '.repeat(30));
    });

    console.log('\n');
    console.log(`✅ Fetched ${articles.length} articles from Légifrance\n`);

    if (articles.length === 0) {
      console.error('❌ No articles found! Check your Légifrance API credentials.');
      process.exit(1);
    }

    // Map to JSON format
    console.log('🔄 Converting to JSON format...');
    const jsonArticles = articles.map(mapArticleToJson);

    // Create output structure
    const output = {
      articles: jsonArticles
    };

    // Ensure data directory exists
    const dataDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Save to file
    console.log(`💾 Saving to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  📊 SUMMARY                               ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total articles fetched: ${articles.length}`);
    console.log(`   • Output file: ${OUTPUT_FILE}`);
    console.log(`   • File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);

    // Count by category
    const categoryCounts: Record<string, number> = {};
    jsonArticles.forEach(article => {
      categoryCounts[article.categorie] = (categoryCounts[article.categorie] || 0) + 1;
    });

    console.log('\n   Articles by category:');
    Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`      • ${category}: ${count} articles`);
      });

    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('🎉 Complete Code civil downloaded successfully!\n');
    console.log('Next steps:');
    console.log('   1. Run: npx tsx scripts/import-and-embed.ts');
    console.log('   2. This will import all articles and generate embeddings\n');

  } catch (error) {
    console.error('\n❌ Error fetching Code civil:', error);
    console.error('\nPlease check:');
    console.error('   1. Your LEGIFRANCE_CLIENT_ID in .env.local');
    console.error('   2. Your LEGIFRANCE_CLIENT_SECRET in .env.local');
    console.error('   3. That your Légifrance application is activated\n');
    process.exit(1);
  }
}

// Run the script
main();
