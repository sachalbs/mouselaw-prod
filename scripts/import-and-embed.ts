#!/usr/bin/env tsx

/**
 * Import and embed Code civil articles from JSON file
 *
 * This script:
 * 1. Reads articles from data/code-civil-api.json
 * 2. Deduplicates articles by numero
 * 3. Upserts them into Supabase database (insert new or update existing)
 * 4. Generates embeddings for vector search (optional)
 *
 * Usage:
 *   npx tsx scripts/import-and-embed.ts                  # Import and embed
 *   npx tsx scripts/import-and-embed.ts --skip-embeddings # Import only, no embeddings
 *   npx tsx scripts/import-and-embed.ts --dry-run         # Test deduplication only
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Parse command line arguments
const args = process.argv.slice(2);
const skipEmbeddings = args.includes('--skip-embeddings');
const dryRun = args.includes('--dry-run');

// JSON file path
const JSON_FILE_PATH = path.join(process.cwd(), 'data', 'code-civil-api.json');

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

// Mistral API configuration
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings';
const MISTRAL_EMBED_MODEL = 'mistral-embed';

interface JsonArticle {
  numero: string;
  titre: string;
  texte: string;
  section: string;
  livre: string;
  categorie: string;
}

interface DatabaseArticle {
  article_number: string;
  title: string;
  content: string;
  category: string;
  code_name: string;
  keywords: string[];
}

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
}

/**
 * Extract keywords from article content for search
 */
function extractKeywords(content: string): string[] {
  const keywords: string[] = [];

  // Common legal terms to extract
  const legalTerms = [
    'responsabilité',
    'dommage',
    'contrat',
    'obligation',
    'propriété',
    'possession',
    'prescription',
    'nullité',
    'résolution',
    'faute',
    'négligence',
    'imprudence',
    'préjudice',
    'indemnisation',
    'réparation',
    'garantie',
    'servitude',
    'usufruit',
    'donation',
    'succession',
    'testament',
    'mariage',
    'divorce',
    'filiation',
    'adoption',
  ];

  const lowerContent = content.toLowerCase();

  for (const term of legalTerms) {
    if (lowerContent.includes(term)) {
      keywords.push(term);
    }
  }

  // Add first few meaningful words
  const words = content
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 5);

  keywords.push(...words.map((w) => w.toLowerCase()));

  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Read articles from JSON file and deduplicate
 */
function readArticlesFromJson(): JsonArticle[] {
  console.log(`📖 Reading articles from ${JSON_FILE_PATH}...`);

  if (!fs.existsSync(JSON_FILE_PATH)) {
    throw new Error(`JSON file not found: ${JSON_FILE_PATH}`);
  }

  const jsonContent = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
  const data = JSON.parse(jsonContent);

  if (!data.articles || !Array.isArray(data.articles)) {
    throw new Error('Invalid JSON format: expected { articles: [...] }');
  }

  const rawCount = data.articles.length;
  console.log(`✅ Loaded ${rawCount} articles from JSON file`);

  // Deduplicate articles by article_number
  console.log(`\n🔍 Deduplicating articles by numero...`);
  const articlesMap = new Map<string, JsonArticle>();
  let duplicatesCount = 0;

  for (const article of data.articles) {
    const key = article.numero;

    if (articlesMap.has(key)) {
      duplicatesCount++;
      // Keep the existing one (first occurrence)
      console.log(`   ⚠️  Duplicate found: Article ${key} (skipping duplicate)`);
    } else {
      articlesMap.set(key, article);
    }
  }

  const uniqueArticles = Array.from(articlesMap.values());
  console.log(`✅ Deduplication complete:`);
  console.log(`   • Raw articles: ${rawCount}`);
  console.log(`   • Duplicates found: ${duplicatesCount}`);
  console.log(`   • Unique articles: ${uniqueArticles.length}`);

  return uniqueArticles;
}

/**
 * Map JSON articles to database format
 */
function mapArticlesToDatabase(jsonArticles: JsonArticle[]): DatabaseArticle[] {
  return jsonArticles.map((article) => ({
    article_number: article.numero,
    title: article.titre,
    content: article.texte,
    category: article.categorie,
    code_name: 'Code civil',
    keywords: extractKeywords(article.texte),
  }));
}

/**
 * Insert or update articles into Supabase database using UPSERT
 */
async function insertArticles(
  articles: DatabaseArticle[]
): Promise<{ imported: number; updated: number; failed: number }> {
  console.log('\n📥 Inserting/updating articles in database using UPSERT...\n');
  console.log(`   Total articles to process: ${articles.length}`);

  if (articles.length === 0) {
    console.log('\n⚠️  No articles to insert\n');
    return { imported: 0, updated: 0, failed: 0 };
  }

  // Check existing articles to track what will be updated vs inserted
  const { data: existingArticles } = await supabase
    .from('code_civil_articles')
    .select('article_number');

  const existingNumbers = new Set(
    existingArticles?.map((a) => a.article_number) || []
  );

  const willUpdate = articles.filter((a) => existingNumbers.has(a.article_number)).length;
  const willInsert = articles.length - willUpdate;

  console.log(`   • Will insert (new): ${willInsert}`);
  console.log(`   • Will update (existing): ${willUpdate}`);
  console.log('');

  // Upsert articles in batches of 100 to avoid timeouts
  const batchSize = 100;
  let imported = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(articles.length / batchSize);

    try {
      // Use UPSERT to insert or update based on article_number
      const { error, status } = await supabase
        .from('code_civil_articles')
        .upsert(batch, {
          onConflict: 'article_number',
          ignoreDuplicates: false, // Update existing rows
        });

      if (error) {
        console.error(`\n   ❌ Error in batch ${batchNum}/${totalBatches}:`, error.message);
        failed += batch.length;
      } else {
        // Count how many were updates vs inserts in this batch
        const batchUpdates = batch.filter((a) => existingNumbers.has(a.article_number)).length;
        const batchInserts = batch.length - batchUpdates;

        imported += batchInserts;
        updated += batchUpdates;
      }

      // Log progress
      const progress = Math.round(((i + batch.length) / articles.length) * 100);
      process.stdout.write(
        `\r   Progress: ${progress}% (${i + batch.length}/${articles.length} articles) - Batch ${batchNum}/${totalBatches}`
      );
    } catch (error) {
      console.error(`\n   ❌ Error processing batch ${batchNum}:`, error);
      failed += batch.length;
    }
  }

  console.log('\n');
  return { imported, updated, failed };
}

/**
 * Generate embeddings for a batch of texts using Mistral API
 */
async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

  const batchSize = 10;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const response = await fetch(MISTRAL_EMBED_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: MISTRAL_EMBED_MODEL,
          input: batch,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mistral API error: ${response.status} - ${errorText}`);
      }

      const data: EmbeddingResponse = await response.json();

      // Add the embeddings in the correct order
      const batchEmbeddings = data.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      results.push(...batchEmbeddings);

      // Update progress
      const progress = Math.round(((i + batch.length) / texts.length) * 100);
      process.stdout.write(
        `\r   Progress: ${progress}% (${i + batch.length}/${texts.length} embeddings)`
      );

      // Add a small delay to avoid rate limiting
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`\n   ❌ Error generating batch embeddings:`, error);
      throw error;
    }
  }

  console.log('\n');
  return results;
}

/**
 * Create enriched content for better embedding quality
 * This adds context and metadata to improve semantic search
 */
function createEnrichedContent(article: {
  article_number: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
}): string {
  // Build enriched text with structure
  const parts: string[] = [];

  // 1. Article identification with full context
  parts.push(`Article ${article.article_number} du Code civil`);

  // 2. Title (if available)
  if (article.title && article.title !== `Article ${article.article_number}`) {
    parts.push(`Titre: ${article.title}`);
  }

  // 3. Category for domain context
  if (article.category && article.category !== 'general') {
    const categoryLabels: { [key: string]: string } = {
      'responsabilite': 'Responsabilité civile',
      'contrats': 'Droit des contrats',
      'propriete': 'Droit de la propriété',
      'famille': 'Droit de la famille',
      'successions': 'Successions et libéralités',
      'obligations': 'Droit des obligations',
      'vente': 'Contrat de vente',
      'mariage': 'Droit du mariage',
    };
    const categoryLabel = categoryLabels[article.category] || article.category;
    parts.push(`Catégorie: ${categoryLabel}`);
  }

  // 4. Main content
  parts.push(`\nContenu: ${article.content}`);

  // 5. Keywords for semantic enrichment
  if (article.keywords && article.keywords.length > 0) {
    const uniqueKeywords = [...new Set(article.keywords)].slice(0, 10); // Top 10 unique keywords
    parts.push(`\nMots-clés: ${uniqueKeywords.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Generate embeddings for articles without embeddings
 * PROGRESSIVE SAVING: Saves after each batch to prevent data loss on crashes
 */
async function embedArticles(): Promise<{ processed: number; failed: number }> {
  console.log('\n🔮 Generating embeddings for articles with ENRICHED content...\n');

  // Fetch all articles without embeddings (including category and keywords for enrichment)
  const { data: articles, error: fetchError } = await supabase
    .from('code_civil_articles')
    .select('id, article_number, content, title, category, keywords')
    .is('embedding', null)
    .order('article_number');

  if (fetchError) {
    console.error('   ❌ Error fetching articles:', fetchError);
    throw fetchError;
  }

  if (!articles || articles.length === 0) {
    console.log('   ✅ No articles need embedding\n');
    return { processed: 0, failed: 0 };
  }

  console.log(`   Found ${articles.length} articles without embeddings`);
  console.log(`   Processing in batches of 50 with progressive saving...\n`);

  // Process in batches of 50 and save immediately after each batch
  const BATCH_SIZE = 50;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, Math.min(i + BATCH_SIZE, articles.length));
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (Articles ${i + 1}-${i + batch.length})`);

    // Prepare enriched texts for this batch
    const textsToEmbed = batch.map((article) => createEnrichedContent(article));

    try {
      // Generate embeddings for this batch
      console.log('   🔮 Generating embeddings...');
      const embeddings = await generateBatchEmbeddings(textsToEmbed);

      // SAVE IMMEDIATELY after generating
      console.log('   💾 Saving to database...');
      for (let j = 0; j < batch.length; j++) {
        const { error } = await supabase
          .from('code_civil_articles')
          .update({ embedding: embeddings[j] })
          .eq('id', batch[j].id);

        if (error) {
          console.error(`   ❌ Error updating article ${batch[j].article_number}:`, error.message);
          failed++;
        } else {
          processed++;
        }
      }

      console.log(`   ✅ Batch ${batchNum}/${totalBatches} saved! (${processed}/${articles.length} total)`);

      // Rate limit protection: wait 2 seconds between batches
      if (i + BATCH_SIZE < articles.length) {
        console.log('   ⏳ Waiting 2s before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error: any) {
      console.error(`\n   ❌ Error processing batch ${batchNum}:`, error.message);
      console.error(`   📝 Progress saved: ${processed}/${articles.length} articles`);
      console.error(`   ♻️  You can restart the script to continue from here.\n`);

      // Don't throw - allow script to report partial progress
      failed += batch.length;

      // If we've made some progress, return it
      if (processed > 0) {
        console.log(`\n⚠️  Partial completion: ${processed} articles saved before error.`);
        return { processed, failed };
      }

      throw error; // Only throw if no progress was made
    }
  }

  console.log('\n');
  return { processed, failed };
}

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         Mouse Law - Code Civil Import & Embedding        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (dryRun) {
    console.log('🧪 DRY RUN MODE - Testing deduplication only (no database operations)\n');
  }

  if (skipEmbeddings) {
    console.log('⏭️  SKIP EMBEDDINGS MODE - Articles will be imported without embeddings\n');
  }

  try {
    // Step 1: Read articles from JSON and deduplicate
    const jsonArticles = readArticlesFromJson();

    // Step 2: Map to database format
    console.log(`\n📝 Mapping articles to database format...`);
    const dbArticles = mapArticlesToDatabase(jsonArticles);
    console.log(`✅ Mapped ${dbArticles.length} articles to database format`);

    // If dry run, stop here
    if (dryRun) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('               🧪 DRY RUN RESULTS                          ');
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log(`   • Total unique articles ready for import: ${dbArticles.length}`);
      console.log(`\n✅ Dry run complete! No database operations performed.\n`);
      return;
    }

    // Step 3: Upsert articles into database
    const { imported, updated, failed } = await insertArticles(dbArticles);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  📊 IMPORT RESULTS                         ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total unique articles in JSON: ${jsonArticles.length}`);
    console.log(`   • Successfully inserted (new): ${imported}`);
    console.log(`   • Successfully updated (existing): ${updated}`);
    console.log(`   • Failed: ${failed}`);

    // Step 4: Generate embeddings (unless skipped)
    if (!skipEmbeddings) {
      const { processed, failed: embedFailed } = await embedArticles();

      console.log('═══════════════════════════════════════════════════════════');
      console.log('                  🔮 EMBEDDING RESULTS                      ');
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log(`   • Embeddings generated: ${processed}`);
      console.log(`   • Failed: ${embedFailed}`);
    }

    // Get final statistics
    const { count: totalCount } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true });

    const { count: embeddedCount } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  📊 DATABASE STATUS                        ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total articles: ${totalCount || 0}`);
    console.log(`   • With embeddings: ${embeddedCount || 0}`);
    console.log(`   • Without embeddings: ${(totalCount || 0) - (embeddedCount || 0)}`);
    console.log(
      `   • Ready for search: ${(totalCount || 0) - (embeddedCount || 0) === 0 ? 'Yes ✅' : 'No ❌'}`
    );

    // Display first 3 articles for verification
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  🔍 SAMPLE ARTICLES                        ');
    console.log('═══════════════════════════════════════════════════════════\n');

    const { data: sampleArticles } = await supabase
      .from('code_civil_articles')
      .select('article_number, title, content, category')
      .order('article_number')
      .limit(3);

    if (sampleArticles && sampleArticles.length > 0) {
      sampleArticles.forEach((article, index) => {
        console.log(`${index + 1}. Article ${article.article_number} - ${article.title}`);
        console.log(`   Catégorie: ${article.category}`);
        console.log(`   Contenu: ${article.content.substring(0, 100)}...`);
        console.log('');
      });
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🎉 Import complete! Mouse Law is ready to use.\n');
  } catch (error) {
    console.error('\n❌ Error during execution:', error);
    process.exit(1);
  }
}

// Run the script
main();
