#!/usr/bin/env tsx

/**
 * Fetch missing Légifrance IDs from PISTE API and save to JSON
 *
 * This script:
 * 1. Reads data/code-civil-api.json
 * 2. For each article without an "id" field, fetches it from PISTE API
 * 3. Saves progress every 100 articles
 * 4. Updates the JSON file with the IDs
 *
 * Usage:
 *   npx tsx scripts/fetch-missing-ids.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const CLIENT_ID = process.env.PISTE_CLIENT_ID!;
const CLIENT_SECRET = process.env.PISTE_CLIENT_SECRET!;
const TOKEN_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';
const API_BASE = 'https://api.piste.gouv.fr/dila/legifrance-beta/lf-engine-app';
const CODE_CIVIL_ID = 'LEGITEXT000006070721';
const RATE_LIMIT_DELAY = 700; // 700ms between requests

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing PISTE credentials in .env.local');
  console.error('   Required: PISTE_CLIENT_ID and PISTE_CLIENT_SECRET');
  console.error('\n   Get them at: https://piste.gouv.fr/');
  process.exit(1);
}

/**
 * Get OAuth2 access token
 */
async function getAccessToken(): Promise<string> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'openid',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error: any) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

/**
 * Fetch article ID from PISTE API
 */
async function fetchArticleId(articleNumber: string, token: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/consult/code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        textId: CODE_CIVIL_ID,
        searchedString: `Article ${articleNumber}`,
        nature: 'CODE',
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Try to find article ID in response
    if (data.sections && data.sections.length > 0) {
      for (const section of data.sections) {
        if (section.articles && section.articles.length > 0) {
          for (const article of section.articles) {
            // Match article number
            if (article.num === articleNumber || article.num === `Article ${articleNumber}`) {
              return article.id;
            }
          }
          // If no exact match, return first article as fallback
          if (section.articles[0]?.id) {
            return section.articles[0].id;
          }
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main function
 */
async function addMissingIds() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('      FETCH MISSING LÉGIFRANCE IDS FROM PISTE API          ');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get access token
  console.log('🔑 Getting access token from PISTE...');
  let token: string;
  try {
    token = await getAccessToken();
    console.log('✅ Access token obtained\n');
  } catch (error: any) {
    console.error('❌ Failed to get access token:', error.message);
    process.exit(1);
  }

  // Read JSON file
  console.log('📖 Reading code-civil-api.json...');
  const jsonPath = path.join(process.cwd(), 'data', 'code-civil-api.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('❌ File not found: data/code-civil-api.json');
    process.exit(1);
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const articles = jsonData.articles || [];

  console.log(`✅ Found ${articles.length} articles in JSON\n`);

  // Count articles needing IDs
  const articlesNeedingIds = articles.filter((a: any) => !a.id);
  const articlesWithIds = articles.length - articlesNeedingIds.length;

  console.log(`📝 Articles needing IDs: ${articlesNeedingIds.length}`);
  console.log(`✅ Articles already have IDs: ${articlesWithIds}\n`);

  if (articlesNeedingIds.length === 0) {
    console.log('🎉 All articles already have IDs! Nothing to do.');
    return;
  }

  console.log('🔄 Fetching IDs from PISTE API...\n');
  console.log('⚠️  This will take ~15-20 minutes due to API rate limits (700ms per request)');
  console.log(`⏱️  Estimated time: ${Math.ceil((articlesNeedingIds.length * RATE_LIMIT_DELAY) / 60000)} minutes\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    // Skip articles that already have an ID
    if (article.id) {
      continue;
    }

    const id = await fetchArticleId(article.numero, token);

    if (id) {
      article.id = id;
      updated++;

      if (updated % 10 === 0 || updated === articlesNeedingIds.length) {
        console.log(`   [${i + 1}/${articles.length}] ✅ ${updated} IDs fetched (Article ${article.numero}: ${id})`);
      }

      // Save progress every 100 articles
      if (updated % 100 === 0) {
        fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
        console.log('   💾 Progress saved to JSON file\n');
      }
    } else {
      failed++;
      if (failed <= 5) {
        console.log(`   [${i + 1}/${articles.length}] ⚠️  Article ${article.numero} - ID not found`);
      }
    }

    // Rate limiting
    await sleep(RATE_LIMIT_DELAY);
  }

  // Final save
  console.log('\n💾 Saving final results...');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log('✅ JSON file updated\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('                  ✅ FETCH COMPLETED                       ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   • Total articles: ${articles.length}`);
  console.log(`   • IDs added: ${updated}`);
  console.log(`   • IDs already present: ${articlesWithIds}`);
  console.log(`   • Failed to fetch: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (updated > 0) {
    console.log('🎉 IDs have been added to code-civil-api.json!');
    console.log('\n📌 NEXT STEP: Update Supabase with the IDs');
    console.log('   Run: npx tsx scripts/update-ids-from-json.ts\n');
  }
}

// Run the script
addMissingIds()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
