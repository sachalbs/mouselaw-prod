/**
 * Légifrance API Client (PISTE)
 *
 * Official API for accessing French legal texts
 * Documentation: https://piste.gouv.fr/documentation
 */

import axios from 'axios';

// OAuth2 Configuration
const OAUTH_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';
const API_BASE_URL = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';
const CODE_CIVIL_ID = 'LEGITEXT000006070721';

// Rate limiting: 100 req/min = 600ms between requests
const RATE_LIMIT_DELAY = 600;

// Token cache
let accessToken: string | null = null;
let tokenExpiry: number | null = null;

export interface LegifranceArticle {
  numero: string;
  titre: string;
  texte: string;
  section: string;
  livre: string;
  categorie: string;
}

/**
 * Get OAuth2 access token
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const clientId = process.env.LEGIFRANCE_CLIENT_ID;
  const clientSecret = process.env.LEGIFRANCE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing LEGIFRANCE credentials in environment variables');
  }

  console.log('🔑 Requesting OAuth2 access token from PISTE...');
  console.log(`   URL: ${OAUTH_URL}`);
  console.log(`   Client ID: ${clientId.substring(0, 8)}...`);

  // Try multiple OAuth2 formats
  const formats = [
    // Format 1: x-www-form-urlencoded with Basic Auth
    {
      name: 'x-www-form-urlencoded + Basic Auth',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      data: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'openid',
      }).toString(),
    },
    // Format 2: x-www-form-urlencoded with credentials in body
    {
      name: 'x-www-form-urlencoded + credentials in body',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'openid',
      }).toString(),
    },
    // Format 3: JSON (original attempt)
    {
      name: 'JSON format',
      headers: {
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'openid',
      }),
    },
  ];

  for (const format of formats) {
    try {
      console.log(`   Trying format: ${format.name}...`);

      const response = await axios.post(OAUTH_URL, format.data, {
        headers: format.headers,
        timeout: 10000,
      });

      accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      tokenExpiry = Date.now() + (expiresIn * 1000) - 60000;

      if (!accessToken) {
        throw new Error('Failed to obtain access token');
      }

      console.log(`✅ Access token obtained with ${format.name}`);
      console.log(`   Token: ${accessToken.substring(0, 20)}...`);
      console.log(`   Expires in: ${expiresIn}s`);
      return accessToken;

    } catch (error: any) {
      console.log(`   ❌ ${format.name} failed: ${error.response?.status || error.message}`);
      if (error.response?.data) {
        console.log(`   Error details:`, error.response.data);
      }
      continue;
    }
  }

  console.error('\n❌ All OAuth2 formats failed');
  console.error('Please verify:');
  console.error('   1. Your PISTE application is activated');
  console.error('   2. You have access to "Légifrance Beta" API');
  console.error('   3. Your credentials are correct');
  console.error('   4. Contact PISTE support: https://piste.gouv.fr/support\n');

  throw new Error('Failed to authenticate with PISTE API after trying all formats');
}

/**
 * Make authenticated API request
 */
async function makeApiRequest(endpoint: string, data: any, retries = 3): Promise<any> {
  const token = await getAccessToken();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(`${API_BASE_URL}${endpoint}`, data, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error: any) {
      if (attempt < retries && error.response?.status === 429) {
        // Rate limit hit, wait and retry
        console.log(`⏳ Rate limit hit, waiting before retry (attempt ${attempt}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      if (attempt < retries && error.response?.status >= 500) {
        // Server error, retry
        console.log(`⚠️  Server error, retrying (attempt ${attempt}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      throw error;
    }
  }
}

/**
 * Parse article from API response
 */
function parseArticle(articleData: any, parentSection = '', parentLivre = ''): LegifranceArticle | null {
  try {
    // Extract article number
    let numero = '';
    if (articleData.num) {
      numero = articleData.num.replace(/^Article\s+/i, '').trim();
    } else if (articleData.id) {
      // Try to extract from ID
      const match = articleData.id.match(/(\d+)/);
      if (match) numero = match[1];
    }

    if (!numero) {
      return null;
    }

    // Extract content
    const texte = articleData.texte || articleData.content || articleData.text || '';

    // Skip empty articles
    if (!texte || texte.length < 10) {
      return null;
    }

    // Extract title
    const titre = articleData.title || articleData.titre || `Article ${numero}`;

    // Extract section and book
    const section = articleData.section || parentSection || '';
    const livre = articleData.book || articleData.livre || parentLivre || '';

    // Determine category from article number
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

    return {
      numero,
      titre,
      texte,
      section,
      livre,
      categorie,
    };
  } catch (error) {
    console.error('Error parsing article:', error);
    return null;
  }
}

/**
 * Recursively extract article IDs from nested structure
 */
function extractArticleIdsFromStructure(
  data: any,
  articleIds: Array<{ id: string; section: string; livre: string }> = [],
  parentSection = '',
  parentLivre = '',
  depth = 0
): Array<{ id: string; section: string; livre: string }> {
  // Max depth to avoid infinite recursion
  if (depth > 10) return articleIds;

  // Process current level articles
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

  // Process sections recursively
  if (data.sections && Array.isArray(data.sections)) {
    for (const section of data.sections) {
      const sectionTitle = section.title || section.titre || parentSection;
      const livreTitle = section.book || section.livre || parentLivre;

      extractArticleIdsFromStructure(
        section,
        articleIds,
        sectionTitle,
        livreTitle,
        depth + 1
      );
    }
  }

  return articleIds;
}

/**
 * Fetch a single article by ID
 */
async function fetchArticleById(
  articleId: string,
  section: string,
  livre: string
): Promise<LegifranceArticle | null> {
  try {
    const response = await makeApiRequest('/consult/getArticle', { id: articleId });

    if (!response || !response.article) {
      return null;
    }

    const articleData = response.article;

    // Extract article number
    let numero = '';
    if (articleData.num) {
      numero = articleData.num.replace(/^Article\\s+/i, '').trim();
    } else if (articleData.id) {
      const match = articleData.id.match(/(\\d+)/);
      if (match) numero = match[1];
    }

    if (!numero) {
      return null;
    }

    // Extract content from texte field
    const texte = articleData.texte?.texteHtml || articleData.texte || articleData.content || '';

    // Skip empty articles
    if (!texte || texte.length < 10) {
      return null;
    }

    // Extract title
    const titre = articleData.titre || `Article ${numero}`;

    // Determine category from article number
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

    return {
      numero,
      titre,
      texte,
      section,
      livre,
      categorie,
    };
  } catch (error) {
    console.error(`Error fetching article ${articleId}:`, error);
    return null;
  }
}

/**
 * Fetch all Code civil articles from Légifrance API
 */
export async function fetchCodeCivilArticles(
  progressCallback?: (current: number, total: number, message: string) => void
): Promise<LegifranceArticle[]> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║      Fetching Code Civil from Légifrance PISTE API      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Get access token
    progressCallback?.(0, 4, 'Authenticating...');
    await getAccessToken();

    // Step 2: Fetch Code civil structure (table of contents)
    progressCallback?.(1, 4, 'Fetching Code civil structure...');

    const structureData = await makeApiRequest('/consult/code/tableMatieres', {
      textId: CODE_CIVIL_ID,
      date: Date.now(),
      sctId: '',
    });

    console.log('✅ Successfully received Code civil structure');

    // Step 3: Extract article IDs from structure
    progressCallback?.(2, 4, 'Extracting article IDs...');

    const articleIds = extractArticleIdsFromStructure(structureData);

    console.log(`✅ Found ${articleIds.length} article IDs in Code civil structure\n`);

    if (articleIds.length === 0) {
      console.log('⚠️  No article IDs found in structure');
      return [];
    }

    // Step 4: Fetch each article individually
    progressCallback?.(3, 4, `Fetching ${articleIds.length} articles...`);

    console.log(`📥 Fetching article content (rate limit: 600ms between requests)...`);
    console.log(`   This will take approximately ${Math.ceil(articleIds.length * 600 / 1000 / 60)} minutes\n`);

    const articles: LegifranceArticle[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < articleIds.length; i++) {
      const { id, section, livre } = articleIds[i];

      // Update progress
      if (i % 10 === 0 || i === articleIds.length - 1) {
        const progress = Math.round(((i + 1) / articleIds.length) * 100);
        process.stdout.write(`\r   Progress: ${progress}% (${i + 1}/${articleIds.length}) - ${successCount} articles fetched` + ' '.repeat(20));
      }

      // Fetch article
      const article = await fetchArticleById(id, section, livre);

      if (article) {
        articles.push(article);
        successCount++;
      } else {
        failedCount++;
      }

      // Rate limiting: 600ms delay between requests (100 req/min)
      if (i < articleIds.length - 1) {
        await sleep(RATE_LIMIT_DELAY);
      }
    }

    console.log('\n');
    console.log(`✅ Successfully fetched ${successCount} articles`);
    if (failedCount > 0) {
      console.log(`⚠️  Failed to fetch ${failedCount} articles\n`);
    }

    progressCallback?.(4, 4, `Completed - ${articles.length} articles fetched`);

    return articles;

  } catch (error: any) {
    console.error('\n❌ Error fetching Code civil:', error.message);

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }

    throw error;
  }
}

/**
 * Test connection to Légifrance API
 */
export async function testConnection(): Promise<boolean> {
  try {
    console.log('🧪 Testing Légifrance API connection...\n');

    const token = await getAccessToken();
    console.log(`✅ Successfully obtained access token`);
    console.log(`   Token: ${token.substring(0, 20)}...\n`);

    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
  }
}

/**
 * Sleep utility for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate-limited batch processing
 */
export async function processBatchWithRateLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  delayMs: number = RATE_LIMIT_DELAY
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    const result = await processor(items[i]);
    results.push(result);

    // Add delay between requests (except for last item)
    if (i < items.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}
