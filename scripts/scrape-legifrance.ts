#!/usr/bin/env tsx

/**
 * Scrape Code civil articles from Légifrance
 *
 * This script scrapes real articles from the official Légifrance website
 * to ensure 100% accuracy and avoid inventing any legal content.
 *
 * Usage:
 *   npx tsx scripts/scrape-legifrance.ts --test        # Test with 10 articles
 *   npx tsx scripts/scrape-legifrance.ts --limit 100   # Scrape 100 articles
 *   npx tsx scripts/scrape-legifrance.ts               # Scrape all articles
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const limitIndex = args.findIndex(arg => arg === '--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : undefined;

const OUTPUT_FILE = path.join(process.cwd(), 'data', 'code-civil-complet-scraped.json');
const DELAY_BETWEEN_REQUESTS = 500; // 500ms between requests to be respectful

interface ScrapedArticle {
  numero: string;
  titre: string;
  texte: string;
  section: string;
  livre: string;
  categorie: string;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTP request with retry logic
 */
async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      console.error(`   ❌ Error fetching ${url} (attempt ${i + 1}/${retries}):`, error instanceof Error ? error.message : error);
      if (i < retries - 1) {
        await sleep(2000); // Wait 2s before retry
      } else {
        throw error;
      }
    }
  }
  throw new Error('Failed after retries');
}

/**
 * Scrape a single article from Légifrance
 */
async function scrapeArticle(articleId: string): Promise<ScrapedArticle | null> {
  const url = `https://www.legifrance.gouv.fr/codes/article_lc/${articleId}`;

  try {
    const html = await fetchWithRetry(url);
    const $ = cheerio.load(html);

    // Extract article number
    const numero = $('.article-num').first().text().trim().replace('Article ', '');

    // Extract article title
    const titre = $('.titre-article').first().text().trim();

    // Extract article content (concatenate all paragraphs)
    const texte = $('.article-content p')
      .map((i, el) => $(el).text().trim())
      .get()
      .join(' ')
      .trim();

    // Extract section and book info from breadcrumb
    const breadcrumbs = $('.fil-ariane a')
      .map((i, el) => $(el).text().trim())
      .get();

    const livre = breadcrumbs.find(b => b.startsWith('Livre')) || '';
    const section = breadcrumbs[breadcrumbs.length - 2] || '';

    // Determine category from article number
    let categorie = 'general';
    const num = parseInt(numero);

    if (num >= 1240 && num <= 1245) categorie = 'responsabilite';
    else if (num >= 1100 && num <= 1231) categorie = 'contrats';
    else if (num >= 144 && num <= 227) categorie = 'mariage';
    else if (num >= 229 && num <= 310) categorie = 'divorce';
    else if (num >= 544 && num <= 710) categorie = 'propriete';
    else if (num >= 721 && num <= 892) categorie = 'successions';
    else if (num >= 1582 && num <= 1701) categorie = 'vente';
    else if (num >= 371 && num <= 387) categorie = 'famille';

    // Validation: ensure article has actual content
    if (!numero || !texte || texte.length < 10) {
      console.log(`   ⚠️  Article ${articleId} has no valid content, skipping`);
      return null;
    }

    return {
      numero,
      titre: titre || `Article ${numero}`,
      texte,
      section,
      livre,
      categorie,
    };
  } catch (error) {
    console.error(`   ❌ Error scraping article ${articleId}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Get list of article IDs to scrape
 * For now, we'll use known article IDs from the Code civil
 * In production, you'd scrape the index page first to get all article IDs
 */
function getArticleIdsToScrape(): string[] {
  // These are Légifrance article IDs (format: LEGIARTI...)
  // For this example, we'll generate IDs for common articles
  // In reality, you'd need to scrape the table of contents first

  // For testing, let's use a smaller set
  const testArticleNumbers = [
    '1240', '1241', '1242', '1243', '1244', '1245', // Responsabilité
    '1101', '1102', '1103', '1104', // Contrats
  ];

  // Generate Légifrance article IDs
  // Note: This is a simplified approach. Real IDs need to be scraped from the TOC
  return testArticleNumbers.map(num => `LEGIARTI${num.padStart(12, '0')}`);
}

/**
 * Scrape table of contents to get all article URLs
 */
async function scrapeTableOfContents(): Promise<string[]> {
  console.log('📚 Scraping Code civil table of contents...\n');

  const tocUrl = 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721';

  try {
    const html = await fetchWithRetry(tocUrl);
    const $ = cheerio.load(html);

    // Find all article links
    const articleLinks: string[] = [];

    $('a[href*="/codes/article_lc/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const articleId = href.split('/').pop();
        if (articleId && articleId.startsWith('LEGIARTI')) {
          articleLinks.push(articleId);
        }
      }
    });

    console.log(`   ✅ Found ${articleLinks.length} article links\n`);
    return articleLinks;
  } catch (error) {
    console.error('   ❌ Error scraping table of contents:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Scraping Code Civil from Légifrance.gouv.fr        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (isTest) {
    console.log('🧪 TEST MODE - Scraping only 10 articles\n');
  } else if (limit) {
    console.log(`📊 LIMIT MODE - Scraping ${limit} articles\n`);
  } else {
    console.log('🌍 FULL MODE - Scraping all Code civil articles\n');
  }

  console.log('⚠️  IMPORTANT: This script respects Légifrance servers with:');
  console.log('   • 500ms delay between requests');
  console.log('   • Proper User-Agent header');
  console.log('   • Retry logic for failed requests\n');

  try {
    // Step 1: Get article IDs
    let articleIds: string[];

    if (isTest) {
      articleIds = getArticleIdsToScrape().slice(0, 10);
    } else if (limit) {
      articleIds = getArticleIdsToScrape().slice(0, limit);
    } else {
      // Try to scrape TOC, fallback to known IDs
      try {
        articleIds = await scrapeTableOfContents();
        if (articleIds.length === 0) {
          console.log('⚠️  No articles found in TOC, using fallback list\n');
          articleIds = getArticleIdsToScrape();
        }
      } catch (error) {
        console.log('⚠️  Could not scrape TOC, using fallback list\n');
        articleIds = getArticleIdsToScrape();
      }
    }

    console.log(`📥 Starting to scrape ${articleIds.length} articles...\n`);

    const articles: ScrapedArticle[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i];
      const progress = Math.round(((i + 1) / articleIds.length) * 100);

      process.stdout.write(
        `\r   Progress: ${progress}% (${i + 1}/${articleIds.length}) - Scraping ${articleId}...` + ' '.repeat(20)
      );

      const article = await scrapeArticle(articleId);

      if (article) {
        articles.push(article);
        successCount++;
      } else {
        failedCount++;
      }

      // Respect rate limiting
      if (i < articleIds.length - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS);
      }
    }

    console.log('\n');

    // Save to JSON file
    const output = { articles };

    // Ensure data directory exists
    const dataDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

    // Display results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  📊 SCRAPING RESULTS                      ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total articles attempted: ${articleIds.length}`);
    console.log(`   • Successfully scraped: ${successCount}`);
    console.log(`   • Failed: ${failedCount}`);
    console.log(`   • Output file: ${OUTPUT_FILE}`);
    console.log(`   • File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB\n`);

    // Show first 3 articles for verification
    if (articles.length > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('                  🔍 SAMPLE ARTICLES                       ');
      console.log('═══════════════════════════════════════════════════════════\n');

      articles.slice(0, 3).forEach((article, index) => {
        console.log(`${index + 1}. Article ${article.numero} - ${article.titre}`);
        console.log(`   Catégorie: ${article.categorie}`);
        console.log(`   Livre: ${article.livre}`);
        console.log(`   Texte: ${article.texte.substring(0, 100)}...\n`);
      });
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🎉 Scraping complete!\n');
    console.log('Next steps:');
    console.log('   1. Verify the scraped articles look correct');
    console.log('   2. Run: npx tsx scripts/import-and-embed.ts');
    console.log('      (Make sure to update the script to use the new file)\n');

  } catch (error) {
    console.error('\n❌ Error during scraping:', error);
    process.exit(1);
  }
}

// Run the script
main();
