/**
 * Stratégies d'import avec cascade de fallback
 *
 * Strategy 1: API Légifrance (PISTE) - Source primaire
 * Strategy 2: Données locales (data/*.json) - Fallback
 * Strategy 3: API data.gouv.fr - Dernier recours
 */

import { loadLocalArticles, NormalizedArticle } from './parsers/local-json-parser';

// ============================================================================
// TYPES
// ============================================================================

export interface LegalCode {
  id: string;
  code_name: string;
  full_name: string;
  legifrance_id: string;
}

export interface ImportResult {
  success: boolean;
  articles: NormalizedArticle[];
  source: 'api-legifrance' | 'local-json' | 'data-gouv' | 'failed';
  error?: string;
  metadata?: {
    format?: string;
    filePath?: string;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LEGIFRANCE_API_URL = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';

// ============================================================================
// STRATEGY 1: API LÉGIFRANCE
// ============================================================================

/**
 * Nettoie le texte HTML
 */
function cleanText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parse récursivement la structure Légifrance
 */
function parseCodeStructure(
  node: any,
  articles: NormalizedArticle[],
  sectionPath: string[] = [],
  context: any = {}
) {
  const currentContext = { ...context };
  const currentPath = [...sectionPath];

  if (node.titre) {
    const titre = node.titre.toLowerCase();
    if (titre.includes('livre')) {
      currentContext.livre = node.titre;
      currentPath.push(node.titre);
    } else if (titre.includes('titre') && !titre.includes('sous-titre')) {
      currentContext.titleSection = node.titre;
      currentPath.push(node.titre);
    } else if (titre.includes('chapitre')) {
      currentContext.chapitre = node.titre;
      currentPath.push(node.titre);
    } else if (titre.includes('section')) {
      currentContext.section = node.titre;
      currentPath.push(node.titre);
    }
  }

  if (node.nature === 'ARTICLE' || node.type === 'article') {
    articles.push({
      article_number: node.num || node.article_number,
      title: node.titre || null,
      content: cleanText(node.texte || node.bloc_textuel?.texte || ''),
      section_path: currentPath.length > 0 ? currentPath.join(' > ') : null,
      book: currentContext.livre || null,
      title_section: currentContext.titleSection || null,
      chapter: currentContext.chapitre || null,
    });
  }

  const children = [
    ...(node.sections || []),
    ...(node.articles || []),
    ...(node.enfants || []),
    ...(node.children || []),
  ];

  for (const child of children) {
    parseCodeStructure(child, articles, currentPath, currentContext);
  }
}

/**
 * Strategy 1: Récupère depuis l'API Légifrance
 */
export async function fetchFromLegifranceAPI(
  code: LegalCode,
  token: string
): Promise<ImportResult> {
  console.log(`\n   🌐 Strategy 1: API Légifrance (PISTE)`);
  console.log(`   Code: ${code.code_name}`);
  console.log(`   ID: ${code.legifrance_id}`);

  try {
    // Validation
    if (!code.legifrance_id || code.legifrance_id === 'UNKNOWN') {
      throw new Error('ID Légifrance manquant');
    }

    if (!token) {
      throw new Error('Token OAuth manquant');
    }

    // Préparer la requête
    const url = `${LEGIFRANCE_API_URL}/consult/code`;
    const body = {
      textId: code.legifrance_id,
      date: '2025-01-01', // Date fixe pour cohérence
      pageSize: 1000,
      pageNumber: 1,
    };

    console.log(`   📤 Requête API:`);
    console.log(`      URL: ${url}`);
    console.log(`      Token: ${token.substring(0, 20)}...`);
    console.log(`      Body: ${JSON.stringify(body, null, 2)}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    console.log(`   📥 Réponse: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ Erreur API: ${errorText.substring(0, 500)}`);

      // Tenter avec date actuelle si 500
      if (response.status === 500) {
        console.log(`   🔄 Nouvelle tentative avec date actuelle...`);
        const retryBody = {
          textId: code.legifrance_id,
          date: new Date().toISOString().split('T')[0],
        };

        const retryResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(retryBody),
        });

        if (!retryResponse.ok) {
          throw new Error(`Erreur API (retry): ${retryResponse.status} - ${await retryResponse.text()}`);
        }

        const data = await retryResponse.json();
        const articles: NormalizedArticle[] = [];
        parseCodeStructure(data, articles);

        console.log(`   ✅ Success (après retry): ${articles.length} articles`);

        return {
          success: true,
          articles,
          source: 'api-legifrance',
        };
      }

      throw new Error(`Erreur API: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const articles: NormalizedArticle[] = [];
    parseCodeStructure(data, articles);

    console.log(`   ✅ Success: ${articles.length} articles`);

    return {
      success: true,
      articles,
      source: 'api-legifrance',
    };
  } catch (error: any) {
    console.error(`   ❌ Strategy 1 échouée:`, error.message);
    return {
      success: false,
      articles: [],
      source: 'failed',
      error: error.message,
    };
  }
}

// ============================================================================
// STRATEGY 2: DONNÉES LOCALES
// ============================================================================

/**
 * Strategy 2: Charge depuis les données locales (data/*.json)
 */
export async function fetchFromLocalJSON(code: LegalCode): Promise<ImportResult> {
  console.log(`\n   📂 Strategy 2: Données locales (data/)`);

  try {
    const articles = loadLocalArticles(code.code_name);

    console.log(`   ✅ Success: ${articles.length} articles`);

    return {
      success: true,
      articles,
      source: 'local-json',
    };
  } catch (error: any) {
    console.error(`   ❌ Strategy 2 échouée:`, error.message);
    return {
      success: false,
      articles: [],
      source: 'failed',
      error: error.message,
    };
  }
}

// ============================================================================
// STRATEGY 3: API DATA.GOUV.FR
// ============================================================================

/**
 * Strategy 3: Récupère depuis data.gouv.fr
 */
export async function fetchFromDataGouv(code: LegalCode): Promise<ImportResult> {
  console.log(`\n   🌍 Strategy 3: API data.gouv.fr`);

  try {
    // Mapping des codes vers les datasets data.gouv
    const datasetMapping: Record<string, string> = {
      'Code Civil': 'code-civil',
      'Code Pénal': 'code-penal',
      // Ajoutez d'autres codes si disponibles
    };

    const datasetId = datasetMapping[code.code_name];
    if (!datasetId) {
      throw new Error(`Dataset data.gouv non disponible pour ${code.code_name}`);
    }

    // URL de l'API data.gouv.fr (exemple)
    const url = `https://www.data.gouv.fr/api/1/datasets/${datasetId}/`;

    console.log(`   📤 Requête: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erreur data.gouv: ${response.status}`);
    }

    const data = await response.json();

    // Parser la réponse data.gouv
    // (Format à adapter selon la vraie structure)
    const articles: NormalizedArticle[] = [];

    console.log(`   ✅ Success: ${articles.length} articles`);

    return {
      success: true,
      articles,
      source: 'data-gouv',
    };
  } catch (error: any) {
    console.error(`   ❌ Strategy 3 échouée:`, error.message);
    return {
      success: false,
      articles: [],
      source: 'failed',
      error: error.message,
    };
  }
}

// ============================================================================
// ORCHESTRATEUR : CASCADE DE FALLBACK
// ============================================================================

/**
 * Tente toutes les stratégies en cascade jusqu'à succès
 */
export async function importCodeWithFallback(
  code: LegalCode,
  token: string
): Promise<ImportResult> {
  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║ Import avec fallback: ${code.code_name.padEnd(42)}║`);
  console.log(`╚═══════════════════════════════════════════════════════════════╝`);

  // Strategy 1: API Légifrance
  const result1 = await fetchFromLegifranceAPI(code, token);
  if (result1.success && result1.articles.length > 0) {
    console.log(`\n   ✅ Source utilisée: API Légifrance`);
    return result1;
  }

  // Strategy 2: Données locales
  const result2 = await fetchFromLocalJSON(code);
  if (result2.success && result2.articles.length > 0) {
    console.log(`\n   ✅ Source utilisée: Données locales (fallback)`);
    return result2;
  }

  // Strategy 3: data.gouv.fr
  const result3 = await fetchFromDataGouv(code);
  if (result3.success && result3.articles.length > 0) {
    console.log(`\n   ✅ Source utilisée: data.gouv.fr (dernier recours)`);
    return result3;
  }

  // Toutes les stratégies ont échoué
  console.error(`\n   ❌ TOUTES LES STRATÉGIES ONT ÉCHOUÉ`);
  console.error(`      Strategy 1 (API): ${result1.error}`);
  console.error(`      Strategy 2 (Local): ${result2.error}`);
  console.error(`      Strategy 3 (DataGouv): ${result3.error}`);

  return {
    success: false,
    articles: [],
    source: 'failed',
    error: 'Toutes les sources ont échoué',
  };
}
