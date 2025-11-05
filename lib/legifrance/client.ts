/**
 * Légifrance API Client (PISTE v2.4.2)
 *
 * Base URL: https://api.piste.gouv.fr/dila/legifrance/lf-engine-app
 * Code civil: LEGITEXT000006070721
 *
 * Endpoints:
 * - /consult/code - Get full code structure with articles
 * - /consult/getArticle - Get specific article by ID
 * - /list/code - List all available codes
 */

interface OAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface LegiFranceArticle {
  id: string;
  num: string; // Article number (e.g., "1240")
  etat: string; // "VIGUEUR" or "ABROGE"
  texte: string; // Article content
  nota?: string; // Notes
  dateDebut?: string;
  dateFin?: string;
}

interface LegiFranceSection {
  titre: string;
  articles: LegiFranceArticle[];
  sections?: LegiFranceSection[];
}

interface ParsedArticle {
  article_number: string;
  content: string;
  title?: string;
  category?: string;
  book?: string;
  chapter?: string;
  is_active: boolean;
}

const PISTE_AUTH_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';
const PISTE_API_URL = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';
const CODE_CIVIL_ID = 'LEGITEXT000006070721';
const REQUEST_TIMEOUT = 30000; // 30 seconds

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Create a fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Get OAuth2 access token from PISTE
 */
async function getAccessToken(): Promise<string> {
  const clientId = process.env.LEGIFRANCE_CLIENT_ID;
  const clientSecret = process.env.LEGIFRANCE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('LEGIFRANCE_CLIENT_ID and LEGIFRANCE_CLIENT_SECRET must be set');
  }

  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    console.log('🔑 Using cached OAuth token');
    return cachedToken.token;
  }

  console.log('🔑 Requesting new OAuth token from PISTE...');
  console.log(`📍 URL: ${PISTE_AUTH_URL}`);

  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid',
    });

    console.log('📤 Request body:', {
      grant_type: 'client_credentials',
      client_id: clientId.substring(0, 8) + '...',
      client_secret: '***',
      scope: 'openid',
    });

    const response = await fetchWithTimeout(
      PISTE_AUTH_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
      10000 // 10s timeout for auth
    );

    console.log(`📥 OAuth response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ OAuth error response:', error);
      throw new Error(`OAuth error: ${response.status} - ${error}`);
    }

    const data: OAuthToken = await response.json();
    console.log(`✅ OAuth token received (expires in ${data.expires_in}s)`);

    // Cache token (expire 5 minutes before actual expiry)
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };

    return data.access_token;
  } catch (error) {
    console.error('❌ Error getting access token:', error);
    throw error;
  }
}

/**
 * Fetch the entire Code civil structure with detailed logging and retry
 *
 * Strategy: Try multiple endpoints in order:
 * 1. /consult/code - Get full code structure
 * 2. /list/code - List all codes to verify access
 */
async function fetchCodeCivilStructure(
  retries = 3
): Promise<any> {
  console.log('\n📚 Fetching Code civil structure from Légifrance API...');

  const token = await getAccessToken();

  // Try /consult/code/tableMatieres endpoint (table of contents with articles)
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = `${PISTE_API_URL}/consult/code/tableMatieres`;
      const requestBody = {
        textId: CODE_CIVIL_ID,
        date: Date.now(),
        sctId: "",
      };

      console.log(`\n🔄 Attempt ${attempt + 1}/${retries} - Endpoint: /consult/code/tableMatieres`);
      console.log(`📍 URL: ${url}`);
      console.log(`📤 Request body:`, requestBody);
      console.log(`🔑 Authorization: Bearer ${token.substring(0, 20)}...`);
      console.log(`⏱️  Timeout: ${REQUEST_TIMEOUT}ms`);

      const startTime = Date.now();

      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
        REQUEST_TIMEOUT
      );

      const elapsed = Date.now() - startTime;
      console.log(`📥 Response received in ${elapsed}ms`);
      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      console.log(`📋 Headers:`, {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`❌ API error response (${response.status}):`, error);

        // Try to parse error as JSON for more details
        try {
          const errorJson = JSON.parse(error);
          console.error(`📋 Error details:`, errorJson);
        } catch {
          // Not JSON, already logged as text
        }

        throw new Error(`API error: ${response.status} - ${error}`);
      }

      console.log('📦 Parsing JSON response...');
      const data = await response.json();

      // Log FULL structure for debugging
      console.log('✅ Successfully received Code civil data');
      console.log(`📊 Response type: ${typeof data}`);
      console.log(`📊 Response keys:`, Object.keys(data || {}).join(', '));

      // Log a sample of the response structure (first 500 chars)
      console.log(`📋 Response sample:`, JSON.stringify(data).substring(0, 500));

      // Check for various possible data structures
      const possibleFields = [
        'sections', 'articles', 'structure', 'texte', 'text',
        'sections', 'parties', 'livres', 'titres', 'chapitres',
        'data', 'content', 'body', 'results'
      ];

      for (const field of possibleFields) {
        if (data[field]) {
          console.log(`📊 Found field '${field}':`, typeof data[field],
            Array.isArray(data[field]) ? `(array of ${data[field].length} items)` : '');
        }
      }

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Attempt ${attempt + 1} failed:`, errorMessage);

      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });
      }

      if (attempt === retries - 1) {
        console.error('❌ All /consult/code attempts failed, trying alternative endpoint...');
        // Try alternative endpoint
        return await fetchCodeCivilViaList(token);
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt + 1) * 1000;
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Failed to fetch Code civil structure after all retries');
}

/**
 * Alternative: Try to get code structure via /list endpoint
 */
async function fetchCodeCivilViaList(token: string): Promise<any> {
  console.log('\n📋 Trying alternative endpoint: /list/code');

  try {
    const url = `${PISTE_API_URL}/list/code`;

    console.log(`📍 URL: ${url}`);

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({}),
      },
      REQUEST_TIMEOUT
    );

    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ /list/code error: ${response.status} - ${error}`);
      throw new Error(`Failed to list codes: ${response.status}`);
    }

    const data = await response.json();
    console.log(`📋 List response:`, JSON.stringify(data).substring(0, 500));

    return data;
  } catch (error) {
    console.error('❌ /list/code failed:', error);
    throw error;
  }
}

/**
 * Parse the nested structure to extract all articles
 * Handles various API response formats
 */
function parseArticlesFromStructure(
  structure: any,
  currentPath: string[] = []
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  console.log('\n📝 Parsing articles from structure...');
  console.log(`📊 Structure type: ${typeof structure}`);
  console.log(`📊 Structure keys: ${Object.keys(structure || {}).join(', ')}`);

  // Helper to extract category from path
  const getCategory = (path: string[]): string | undefined => {
    if (path.length === 0) return undefined;
    return path[0]; // Use the first level (book) as category
  };

  // Helper to extract book/chapter from path
  const getBook = (path: string[]): string | undefined => {
    return path.length > 0 ? path[0] : undefined;
  };

  const getChapter = (path: string[]): string | undefined => {
    return path.length > 1 ? path[1] : undefined;
  };

  // Recursive function to traverse the structure
  function traverse(node: any, path: string[], depth: number = 0) {
    if (!node || typeof node !== 'object') {
      return;
    }

    // If this node has a title/titre/nom/intitule, add it to the path
    const titleField = node.titre || node.title || node.nom || node.intitule;
    const currentTitlePath = titleField ? [...path, titleField] : path;

    // Log what we're processing
    if (depth === 0) {
      console.log(`🔍 Processing root level...`);
    }

    // Process articles at this level - try multiple field names
    const articlesArray = node.articles || node.article || node.items || node.textes;
    if (articlesArray && Array.isArray(articlesArray)) {
      console.log(`  ${'  '.repeat(depth)}📄 Found ${articlesArray.length} articles at depth ${depth}`);

      for (const article of articlesArray) {
        // Only include articles that are in force
        const etat = article.etat || article.status || article.state;
        if (etat && etat !== 'VIGUEUR' && etat !== 'VIGEUR' && etat !== 'ACTIVE') {
          continue;
        }

        // Clean article number (try multiple field names)
        let articleNum = article.num || article.numero || article.number || article.id;
        if (articleNum && typeof articleNum === 'string') {
          if (articleNum.toLowerCase().startsWith('article ')) {
            articleNum = articleNum.substring(8).trim();
          }
        }

        // Clean content (try multiple field names)
        let content = article.texte || article.text || article.content || article.contenu || '';
        if (typeof content === 'string') {
          content = content.replace(/<[^>]*>/g, '').trim();
        }

        if (content && articleNum) {
          articles.push({
            article_number: String(articleNum),
            content,
            title: currentTitlePath[currentTitlePath.length - 1],
            category: getCategory(currentTitlePath),
            book: getBook(currentTitlePath),
            chapter: getChapter(currentTitlePath),
            is_active: true,
          });
        }
      }
    }

    // Try multiple field names for nested structures
    const nestedFields = [
      'sections', 'section', 'parties', 'partie', 'livres', 'livre',
      'titres', 'titre', 'chapitres', 'chapitre', 'structure', 'children',
      'enfants', 'sousArticles', 'subSections'
    ];

    for (const field of nestedFields) {
      const nested = node[field];
      if (nested && Array.isArray(nested)) {
        console.log(`  ${'  '.repeat(depth)}📁 Processing ${nested.length} ${field} at depth ${depth}`);
        for (const item of nested) {
          traverse(item, currentTitlePath, depth + 1);
        }
      }
    }

    // If node itself looks like a single article (not a container)
    if (!articlesArray && (node.num || node.numero)) {
      const etat = node.etat || node.status;
      if (!etat || etat === 'VIGUEUR' || etat === 'VIGEUR' || etat === 'ACTIVE') {
        let articleNum = node.num || node.numero || node.number || node.id;
        if (articleNum && typeof articleNum === 'string') {
          if (articleNum.toLowerCase().startsWith('article ')) {
            articleNum = articleNum.substring(8).trim();
          }
        }

        let content = node.texte || node.text || node.content || node.contenu || '';
        if (typeof content === 'string') {
          content = content.replace(/<[^>]*>/g, '').trim();
        }

        if (content && articleNum) {
          console.log(`  ${'  '.repeat(depth)}📄 Found single article: ${articleNum}`);
          articles.push({
            article_number: String(articleNum),
            content,
            title: currentTitlePath[currentTitlePath.length - 1],
            category: getCategory(currentTitlePath),
            book: getBook(currentTitlePath),
            chapter: getChapter(currentTitlePath),
            is_active: true,
          });
        }
      }
    }
  }

  traverse(structure, currentPath, 0);

  console.log(`✅ Parsing complete: ${articles.length} articles extracted\n`);

  return articles;
}

/**
 * Fetch all articles from the Code civil
 *
 * @param onProgress - Callback for progress updates
 * @returns Array of parsed articles
 */
export async function fetchCodeCivilArticles(
  onProgress?: (current: number, total: number, message: string) => void
): Promise<ParsedArticle[]> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║         Fetching Code civil from Légifrance API         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  onProgress?.(0, 1, 'Connecting to Légifrance API...');

  const structure = await fetchCodeCivilStructure();

  onProgress?.(1, 2, 'Parsing articles from structure...');

  const articles = parseArticlesFromStructure(structure);

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Successfully parsed ${articles.length.toString().padEnd(4)} articles from Code civil  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  onProgress?.(2, 2, `Successfully parsed ${articles.length} articles`);

  return articles;
}

/**
 * Fetch a specific article by number
 */
export async function fetchArticleByNumber(
  articleNumber: string
): Promise<ParsedArticle | null> {
  const token = await getAccessToken();

  try {
    const url = `${PISTE_API_URL}/consult/getArticle`;
    console.log(`📄 Fetching article ${articleNumber}...`);
    console.log(`📍 URL: ${url}`);

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: `LEGIARTI${articleNumber}`,
        }),
      },
      REQUEST_TIMEOUT
    );

    console.log(`📥 Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`❌ Article not found: ${articleNumber}`);
      return null;
    }

    const data = await response.json();

    // Parse the article data
    return {
      article_number: articleNumber,
      content: data.texte?.replace(/<[^>]*>/g, '').trim() || '',
      title: data.titre,
      is_active: data.etat === 'VIGUEUR',
    };
  } catch (error) {
    console.error('❌ Error fetching article:', error);
    return null;
  }
}

/**
 * Test connection to Légifrance API
 */
export async function testLegiFranceConnection(): Promise<boolean> {
  console.log('\n🧪 Testing Légifrance API connection...\n');

  try {
    const token = await getAccessToken();
    console.log('\n✅ Successfully authenticated with Légifrance API');
    console.log(`🔑 Token: ${token.substring(0, 20)}...`);
    return true;
  } catch (error) {
    console.error('\n❌ Failed to authenticate with Légifrance API');
    console.error('Error:', error);
    return false;
  }
}
