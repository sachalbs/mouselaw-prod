#!/usr/bin/env tsx

/**
 * ROBUST Import of Code civil from Légifrance PISTE API
 *
 * Features:
 * - Progressive saving every 100 articles
 * - Automatic resume from last saved position
 * - Timeout handling (10s max per article)
 * - Retry logic with exponential backoff
 * - Failed articles tracking
 * - Detailed progress logging
 *
 * Usage:
 *   npx tsx scripts/import-legifrance-robust.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getAccessToken } from '@/lib/legifrance-api';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const OUTPUT_FILE = path.join(process.cwd(), 'data', 'code-civil-api.json');
const FAILED_FILE = path.join(process.cwd(), 'data', 'failed-articles.json');
const BATCH_SIZE = 100;
const TIMEOUT_MS = 10000; // 10 seconds per article
const RATE_LIMIT_DELAY = 600; // 600ms between requests
const MAX_RETRIES = 3;
const CODE_CIVIL_ID = 'LEGITEXT000006070721';

interface Article {
  numero: string;
  titre: string;
  texte: string;
  section: string;
  livre: string;
  categorie: string;
  id: string; // Légifrance article ID
}

interface ArticleId {
  id: string;
  section: string;
  livre: string;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make API request with timeout
 */
async function makeApiRequestWithTimeout(
  endpoint: string,
  data: any,
  token: string,
  timeoutMs: number = TIMEOUT_MS
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await axios.post(
      `https://api.piste.gouv.fr/dila/legifrance/lf-engine-app${endpoint}`,
      data,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        signal: controller.signal,
        timeout: timeoutMs,
      }
    );

    clearTimeout(timeoutId);
    return response.data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_CANCELED') {
      throw new Error(`Timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Fetch single article with retry logic
 */
async function fetchArticleWithRetry(
  articleId: string,
  section: string,
  livre: string,
  token: string,
  retries: number = MAX_RETRIES
): Promise<Article | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await makeApiRequestWithTimeout(
        '/consult/getArticle',
        { id: articleId },
        token,
        TIMEOUT_MS
      );

      const elapsed = Date.now() - startTime;

      if (!response || !response.article) {
        return null;
      }

      const articleData = response.article;

      // Extract article number
      let numero = '';
      if (articleData.num) {
        numero = articleData.num.replace(/^Article\s+/i, '').trim();
      } else if (articleData.id) {
        const match = articleData.id.match(/(\d+)/);
        if (match) numero = match[1];
      }

      if (!numero) {
        return null;
      }

      // Extract content
      const texte = articleData.texte?.texteHtml || articleData.texte || articleData.content || '';

      // Skip empty articles
      if (!texte || texte.length < 10) {
        return null;
      }

      const titre = articleData.titre || `Article ${numero}`;

      // Determine category
      const num = parseInt(numero);
      let categorie = 'general';

      if (num >= 1240 && num <= 1245) categorie = 'responsabilite';
      else if (num >= 1100 && num <= 1231) categorie = 'contrats';
      else if (num >= 144 && num <= 227) categorie = 'mariage';
      else if (num >= 229 && num <= 310) categorie = 'divorce';
      else if (num >= 544 && num <= 710) categorie = 'propriete';
      else if (num >= 721 && num <= 892) categorie = 'successions';
      else if (num >= 1582 && num <= 1701) categorie = 'vente';
      else if (num >= 371 && num <= 387) categorie = 'famille';
      else if (num >= 1382 && num <= 1386) categorie = 'responsabilite';

      console.log(`   ✅ Article ${numero} fetched in ${elapsed}ms (ID: ${articleId})`);

      return {
        numero,
        titre,
        texte,
        section,
        livre,
        categorie,
        id: articleId, // Save Légifrance ID
      };

    } catch (error: any) {
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`   ⚠️  Attempt ${attempt}/${retries} failed, retrying in ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }

      console.log(`   ❌ Failed after ${retries} attempts: ${error.message}`);
      return null;
    }
  }

  return null;
}

/**
 * Extract article IDs from structure
 */
function extractArticleIds(data: any, articleIds: ArticleId[] = [], parentSection = '', parentLivre = '', depth = 0): ArticleId[] {
  if (depth > 10) return articleIds;

  if (data.articles && Array.isArray(data.articles)) {
    for (const articleData of data.articles) {
      const articleId = articleData.id;
      if (articleId && articleId.startsWith('LEGIARTI')) {
        articleIds.push({
          id: articleId,
          section: parentSection,
          livre: parentLivre,
        });
      }
    }
  }

  if (data.sections && Array.isArray(data.sections)) {
    for (const section of data.sections) {
      const sectionTitle = section.title || section.titre || parentSection;
      const livreTitle = section.book || section.livre || parentLivre;

      extractArticleIds(section, articleIds, sectionTitle, livreTitle, depth + 1);
    }
  }

  return articleIds;
}

/**
 * Save articles to file
 */
function saveArticles(articles: Article[], filePath: string): void {
  // DEBUG: Check if articles have id field before saving
  if (articles.length > 0) {
    console.log('\n🔍 DEBUG - Sample article before save:');
    console.log(JSON.stringify(articles[0], null, 2));
    console.log(`   Has "id" field: ${articles[0].hasOwnProperty('id')}`);
    if (articles[0].id) {
      console.log(`   ID value: ${articles[0].id}`);
    }
  }

  const output = { articles };
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`✅ Saved ${articles.length} articles to ${filePath}\n`);
}

/**
 * Load existing articles
 */
function loadExistingArticles(filePath: string): Article[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.articles || [];
  } catch (error) {
    console.log('⚠️  Could not load existing articles, starting fresh');
    return [];
  }
}

/**
 * Load failed article IDs
 */
function loadFailedArticles(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.failedIds || [];
  } catch (error) {
    return [];
  }
}

/**
 * Save failed article IDs
 */
function saveFailedArticles(failedIds: string[], filePath: string): void {
  const output = { failedIds, count: failedIds.length };
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
}

/**
 * Format time estimation
 */
function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     ROBUST Code Civil Import from PISTE API              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    // Check credentials
    const clientId = process.env.LEGIFRANCE_CLIENT_ID;
    const clientSecret = process.env.LEGIFRANCE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ Missing LEGIFRANCE credentials\n');
      process.exit(1);
    }

    console.log('✅ Credentials found\n');

    // Ensure data directory exists
    const dataDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Step 1: Load existing progress
    console.log('📂 Checking for existing progress...\n');
    const existingArticles = loadExistingArticles(OUTPUT_FILE);
    const failedIds = loadFailedArticles(FAILED_FILE);

    if (existingArticles.length > 0) {
      console.log(`   ✅ Found ${existingArticles.length} existing articles`);
      console.log(`   📁 File: ${OUTPUT_FILE}\n`);
    }

    if (failedIds.length > 0) {
      console.log(`   ⚠️  Found ${failedIds.length} previously failed articles\n`);
    }

    // Step 2: Get OAuth token
    console.log('🔑 Getting OAuth2 access token...\n');
    const token = await getAccessToken();
    console.log('   ✅ Token obtained\n');

    // Step 3: Fetch structure
    console.log('📥 Fetching Code civil structure...\n');
    const structureResponse = await makeApiRequestWithTimeout(
      '/consult/code/tableMatieres',
      {
        textId: CODE_CIVIL_ID,
        date: Date.now(),
        sctId: '',
      },
      token,
      30000
    );

    const articleIds = extractArticleIds(structureResponse);
    console.log(`   ✅ Found ${articleIds.length} article IDs\n`);

    // Step 4: Determine starting position
    const alreadyFetchedIds = new Set(existingArticles.map(a => `Article ${a.numero}`));
    const startIndex = existingArticles.length;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  🚀 STARTING IMPORT                       ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   Total articles: ${articleIds.length}`);
    console.log(`   Already imported: ${existingArticles.length}`);
    console.log(`   Remaining: ${articleIds.length - existingArticles.length}`);
    console.log(`   Batch size: ${BATCH_SIZE}`);
    console.log(`   Timeout per article: ${TIMEOUT_MS}ms`);
    console.log(`   Rate limit: ${RATE_LIMIT_DELAY}ms between requests\n`);

    // Step 5: Fetch articles progressively
    const allArticles = [...existingArticles];
    const newFailedIds: string[] = [];
    let successCount = 0;
    let failCount = 0;
    let batchStartTime = Date.now();

    // Process ALL articles (no limit)
    const endIndex = articleIds.length;

    console.log(`\n🚀 FULL IMPORT MODE: Processing all ${articleIds.length} articles\n`);
    console.log(`   Estimated duration: ${Math.ceil((articleIds.length * (RATE_LIMIT_DELAY + 2000)) / 1000 / 60)} minutes\n`);

    for (let i = startIndex; i < endIndex; i++) {
      const { id, section, livre } = articleIds[i];
      const progress = ((i + 1) / articleIds.length * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const avgTimePerArticle = elapsed / (i - startIndex + 1);
      const remaining = articleIds.length - i - 1;
      const eta = avgTimePerArticle * remaining;

      console.log(`\n📄 Article ${i + 1}/${articleIds.length} (${progress}%) - ETA: ${formatETA(eta)}`);
      console.log(`   ID: ${id}`);

      try {
        const article = await fetchArticleWithRetry(id, section, livre, token);

        if (article) {
          allArticles.push(article);
          successCount++;
        } else {
          console.log(`   ⚠️  Article returned no content`);
          failCount++;
          newFailedIds.push(id);
        }

        // Save batch every BATCH_SIZE articles
        if (allArticles.length % BATCH_SIZE === 0) {
          const batchTime = (Date.now() - batchStartTime) / 1000;
          console.log(`\n💾 Saving batch: ${allArticles.length} articles (batch took ${batchTime.toFixed(1)}s)`);
          saveArticles(allArticles, OUTPUT_FILE);
          console.log(`   ✅ Saved to ${OUTPUT_FILE}`);
          batchStartTime = Date.now();
        }

        // Rate limiting
        if (i < articleIds.length - 1) {
          await sleep(RATE_LIMIT_DELAY);
        }

      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
        failCount++;
        newFailedIds.push(id);
      }
    }

    // Final save
    console.log(`\n💾 Saving final batch...\n`);
    saveArticles(allArticles, OUTPUT_FILE);

    // Save failed IDs
    if (newFailedIds.length > 0) {
      const allFailedIds = [...new Set([...failedIds, ...newFailedIds])];
      saveFailedArticles(allFailedIds, FAILED_FILE);
      console.log(`   ⚠️  Saved ${allFailedIds.length} failed article IDs to ${FAILED_FILE}`);
    }

    // Display results
    const totalTime = (Date.now() - startTime) / 1000;

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  ✅ IMPORT COMPLETED                      ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   Total time: ${formatETA(totalTime)}`);
    console.log(`   Total articles in file: ${allArticles.length}`);
    console.log(`   Successfully fetched: ${successCount}`);
    console.log(`   Failed/Empty: ${failCount}`);
    console.log(`   Output file: ${OUTPUT_FILE}`);
    console.log(`   File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB\n`);

    // Count by category
    const categoryCounts: Record<string, number> = {};
    allArticles.forEach(article => {
      categoryCounts[article.categorie] = (categoryCounts[article.categorie] || 0) + 1;
    });

    console.log('   Articles by category:');
    Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`      • ${category}: ${count} articles`);
      });

    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('🎉 Import complete!\n');
    console.log('Next steps:');
    console.log('   1. Verify: cat data/code-civil-api.json | jq ".articles | length"');
    console.log('   2. Import to Supabase: npx tsx scripts/import-and-embed.ts');
    console.log('   3. If there are failed articles: npx tsx scripts/retry-failed-articles.ts\n');

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error('\n   The import will resume from the last saved batch when rerun.\n');
    process.exit(1);
  }
}

// Run the script
main();
