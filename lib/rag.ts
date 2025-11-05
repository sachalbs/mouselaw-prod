/**
 * Retrieval-Augmented Generation (RAG) System
 *
 * Hybrid search across Code civil articles and jurisprudence (case law)
 * Uses vector embeddings for semantic similarity search
 */

import { supabaseServer } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/mistral/embeddings';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface RelevantArticle {
  id: string;
  article_number: string;
  title: string | null;
  content: string;
  code: string; // Nom du code (Code civil, Code pénal, etc.)
  section_path: string | null;
  similarity: number;
  legifranceUrl: string;
}

export interface RelevantJurisprudence {
  id: string;
  juridiction: string;
  date: string;
  numero: string;
  nom_usuel: string | null;
  titre: string;
  faits: string;
  solution: string;
  principe: string;
  articles_lies: string[];
  categorie: string | null;
  importance: string | null;
  mots_cles: string[];
  similarity: number;
  legifrance_id: string | null;
  legifranceUrl: string;
}

export interface MethodologyResource {
  id: string;
  type: string;
  category: string;
  subcategory?: string;
  title: string;
  content: string;
  keywords: string[];
  level?: string;
  duration_minutes?: number;
  points_notation?: number;
  related_legal_concepts?: string[];
  example_cases?: string[];
  similarity: number;
}

export interface RelevantSources {
  articles: RelevantArticle[];
  jurisprudence: RelevantJurisprudence[];
  methodologies: MethodologyResource[];
  query: string;
  totalSources: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Construit l'URL Légifrance pour une source
 * @param code - Nom du code (ex: "Code civil")
 * @returns URL complète vers la page Légifrance
 */
function buildLegifranceUrl(code: string): string {
  // Mapping des codes vers leurs identifiants Légifrance
  const codeIds: Record<string, string> = {
    'Code civil': 'LEGITEXT000006070721',
    'Code pénal': 'LEGITEXT000006070719',
    'Code de commerce': 'LEGITEXT000005634379',
    'Code du travail': 'LEGITEXT000006072050',
    'Code de procédure civile': 'LEGITEXT000006070716',
    'Code de procédure pénale': 'LEGITEXT000006071154',
  };

  const codeId = codeIds[code] || 'LEGITEXT000006070721'; // Fallback Code civil
  return `https://www.legifrance.gouv.fr/codes/texte_lc/${codeId}`;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Extract article numbers from query text
 * Matches patterns like: "Article 1240", "art 1240", "art. 1240", etc.
 */
function extractArticleNumbers(query: string): string[] {
  const patterns = [
    /article\s+(\d+(?:-\d+)?)/gi,
    /art\.?\s+(\d+(?:-\d+)?)/gi,
    /articles?\s+(\d+(?:-\d+)?)\s+(?:à|au|et)\s+(\d+(?:-\d+)?)/gi,
  ];

  const numbers = new Set<string>();

  for (const pattern of patterns) {
    const matches = query.matchAll(pattern);
    for (const match of matches) {
      // Add all captured groups (article numbers)
      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          numbers.add(match[i]);
        }
      }
    }
  }

  return Array.from(numbers);
}

/**
 * Search for articles by exact article number
 */
async function searchArticlesByNumber(articleNumbers: string[]): Promise<RelevantArticle[]> {
  if (articleNumbers.length === 0) {
    return [];
  }

  logger.debug(`   Searching for exact articles: ${articleNumbers.join(', ')}`);

  const { data, error } = await supabaseServer
    .from('legal_articles')
    .select(`
      id,
      article_number,
      title,
      content,
      section_path,
      legal_codes!inner (
        display_name
      )
    `)
    .in('article_number', articleNumbers);

  if (error) {
    logger.error('   Error in exact article search:', error);
    return [];
  }

  if (!data || data.length === 0) {
    logger.debug(`   No exact matches found for articles: ${articleNumbers.join(', ')}`);
    return [];
  }

  logger.success(`   Found ${data.length} exact matches`);

  // Add perfect similarity score (1.0) for exact matches
  return data.map((article: any) => ({
    id: article.id,
    article_number: article.article_number,
    title: article.title,
    content: article.content,
    code: article.legal_codes.display_name,
    section_path: article.section_path,
    similarity: 1.0, // Perfect match
    legifranceUrl: buildLegifranceUrl(article.legal_codes.display_name),
  }));
}

/**
 * Search for relevant Code civil articles using HYBRID search
 * Combines exact article number matching with vector similarity search
 */
async function searchRelevantArticles(
  query: string,
  queryEmbedding: number[],
  limit: number = 5,
  matchThreshold: number = 0.5
): Promise<RelevantArticle[]> {
  logger.debug(`\n   HYBRID SEARCH - Exact + Vector similarity`);
  logger.debug(`      • Limit: ${limit}`);
  logger.debug(`      • Threshold: ${matchThreshold}`);
  logger.debug(`      • Embedding dimensions: ${queryEmbedding.length}`);

  try {
    // Step 1: Extract article numbers from query
    const articleNumbers = extractArticleNumbers(query);
    let exactMatches: RelevantArticle[] = [];

    if (articleNumbers.length > 0) {
      logger.debug(`\n   EXACT MATCH MODE: Found article numbers in query`);
      exactMatches = await searchArticlesByNumber(articleNumbers);
    }

    // Step 2: Vector similarity search
    logger.debug(`\n   VECTOR SEARCH: Semantic similarity`);

    // Direct vector search using pgvector <=> operator
    // Retrieve many articles to calculate similarity client-side
    const { data, error } = await supabaseServer
      .from('legal_articles')
      .select(`
        id,
        article_number,
        title,
        content,
        section_path,
        embedding,
        legal_codes!inner (
          display_name
        )
      `)
      .not('embedding', 'is', null)
      .limit(1000); // Get many articles for similarity calculation

    if (error) {
      logger.error('   Supabase query error:', error);
      logger.error('   Error details:', JSON.stringify(error, null, 2));
      // Return exact matches if vector search failed
      return exactMatches;
    }

    logger.success(`   Retrieved ${data?.length || 0} articles with embeddings`);

    // Calculate cosine similarity manually
    const allResults = (data || []).map((article: any) => {
      // Parse embedding if it's a string (pgvector format: "[0.1,0.2,...]")
      let embedding: number[];
      if (typeof article.embedding === 'string') {
        embedding = JSON.parse(article.embedding);
      } else if (Array.isArray(article.embedding)) {
        embedding = article.embedding;
      } else {
        logger.warn(`   Invalid embedding format for article ${article.article_number}`);
        embedding = [];
      }

      // Calculate cosine similarity
      let dotProduct = 0;
      let mag1 = 0;
      let mag2 = 0;

      for (let i = 0; i < queryEmbedding.length && i < embedding.length; i++) {
        dotProduct += queryEmbedding[i] * embedding[i];
        mag1 += queryEmbedding[i] * queryEmbedding[i];
        mag2 += embedding[i] * embedding[i];
      }

      const similarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));

      return {
        id: article.id,
        article_number: article.article_number,
        title: article.title,
        content: article.content,
        code: article.legal_codes.display_name,
        section_path: article.section_path,
        similarity: similarity,
        legifranceUrl: buildLegifranceUrl(article.legal_codes.display_name),
      };
    });

    // DEBUG: Show top similarities
    const sorted = [...allResults].sort((a, b) => b.similarity - a.similarity);
    logger.debug(`\n   DEBUG - Top 5 similarity scores:`);
    sorted.slice(0, 5).forEach((a, idx) => {
      logger.debug(`      ${idx + 1}. Article ${a.article_number}: ${a.similarity.toFixed(4)} ${a.similarity >= matchThreshold ? '✅' : '❌'}`);
    });

    const vectorResults = allResults
      .filter(article => article.similarity >= matchThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    logger.success(`\n   Filtered to ${vectorResults.length} articles above threshold (≥${matchThreshold})`);

    // Merge results: exact matches first, then vector results (deduplicated)
    const exactArticleNumbers = new Set(exactMatches.map(a => a.article_number));
    const vectorResultsFiltered = vectorResults.filter(
      article => !exactArticleNumbers.has(article.article_number)
    );

    const combinedResults = [...exactMatches, ...vectorResultsFiltered];

    // Sort by similarity score (exact matches with 1.0 will be first)
    combinedResults.sort((a, b) => b.similarity - a.similarity);

    // Apply user-specified threshold (keep exact matches regardless)
    const filteredResults = combinedResults.filter(
      article => article.similarity === 1.0 || article.similarity >= matchThreshold
    );

    // Limit to requested count
    const finalResults = filteredResults.slice(0, limit);

    logger.debug(`\n   HYBRID SEARCH RESULTS:`);
    logger.debug(`      • Exact matches: ${exactMatches.length}`);
    logger.debug(`      • Vector results: ${vectorResults.length}`);
    logger.debug(`      • Combined (deduplicated): ${combinedResults.length}`);
    logger.debug(`      • After threshold filter (≥${matchThreshold}): ${filteredResults.length}`);
    logger.debug(`      • Final results (top ${limit}): ${finalResults.length}`);

    if (finalResults.length > 0) {
      logger.debug(`\n   Top results:`);
      finalResults.slice(0, 5).forEach((article: any, idx: number) => {
        const badge = article.similarity === 1.0 ? 'EXACT' : 'VECTOR';
        logger.debug(`      ${idx + 1}. ${badge} Article ${article.article_number} - ${(article.similarity * 100).toFixed(2)}%`);
      });
    } else {
      logger.warn('   No articles found after filtering!');
    }

    return finalResults;
  } catch (error) {
    console.error('   ❌ Exception in searchRelevantArticles:', error);
    return [];
  }
}

/**
 * Search for relevant jurisprudence (case law)
 */
async function searchRelevantJurisprudence(
  queryEmbedding: number[],
  limit: number = 8,  // INCREASED from 3 to 8 for better coverage
  matchThreshold: number = 0.40  // LOWERED from 0.50 to 0.40 for better recall
): Promise<RelevantJurisprudence[]> {
  try {
    console.log(`\n   ⚖️  JURISPRUDENCE SEARCH`);
    console.log(`      • Limit: ${limit}`);
    console.log(`      • Threshold: ${matchThreshold}`);

    const { data, error } = await supabaseServer
      .from('case_law')
      .select(`
        id,
        title,
        decision_date,
        decision_number,
        summary,
        full_text,
        embedding,
        jurisdictions!inner (
          name
        )
      `)
      .not('embedding', 'is', null)
      .limit(500); // Fetch more to calculate similarity

    if (error) {
      console.error('   ❌ Error searching jurisprudence:', error);
      return [];
    }

    console.log(`   ✅ Retrieved ${data?.length || 0} case law documents with embeddings`);

    // Calculate similarity and format
    const allResults = (data || [])
      .map((caselaw: any) => {
        // Parse embedding if it's a string (pgvector format)
        let embedding: number[];
        if (typeof caselaw.embedding === 'string') {
          embedding = JSON.parse(caselaw.embedding);
        } else if (Array.isArray(caselaw.embedding)) {
          embedding = caselaw.embedding;
        } else {
          console.warn(`   ⚠️  Invalid embedding format for case ${caselaw.id}`);
          embedding = [];
        }

        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;

        for (let i = 0; i < queryEmbedding.length && i < embedding.length; i++) {
          dotProduct += queryEmbedding[i] * embedding[i];
          mag1 += queryEmbedding[i] * queryEmbedding[i];
          mag2 += embedding[i] * embedding[i];
        }

        const similarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));

        // Format date (YYYY-MM-DD -> DD/MM/YYYY)
        const formattedDate = caselaw.decision_date
          ? new Date(caselaw.decision_date).toLocaleDateString('fr-FR')
          : 'Date inconnue';

        return {
          id: caselaw.id,
          juridiction: caselaw.jurisdictions?.name || 'Juridiction inconnue',
          date: formattedDate,
          numero: caselaw.decision_number || 'N/A',
          nom_usuel: null, // Not in schema
          titre: caselaw.title || 'Sans titre',
          faits: caselaw.full_text?.substring(0, 500) || '', // Extract from full text
          solution: caselaw.summary || 'Non spécifié',
          principe: caselaw.summary || '',
          articles_lies: [],
          categorie: null,
          importance: null,
          mots_cles: [],
          similarity: similarity,
          legifrance_id: null,
          legifranceUrl: 'https://www.legifrance.gouv.fr', // Generic fallback
        };
      });

    // DEBUG: Show top similarities
    const sorted = [...allResults].sort((a, b) => b.similarity - a.similarity);
    console.log(`\n   🔍 DEBUG - Top 5 jurisprudence similarity scores:`);
    sorted.slice(0, 5).forEach((j, idx) => {
      console.log(`      ${idx + 1}. ${j.titre.substring(0, 40)}: ${j.similarity.toFixed(4)} ${j.similarity >= matchThreshold ? '✅' : '❌'}`);
    });

    const results = allResults
      .filter(j => j.similarity >= matchThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`\n   ✅ Filtered to ${results.length} jurisprudence above threshold (≥${matchThreshold})`);

    if (results.length > 0) {
      console.log(`\n   📋 Top jurisprudence results:`);
      results.forEach((j, idx) => {
        console.log(`      ${idx + 1}. ${j.juridiction} - ${j.date} - ${(j.similarity * 100).toFixed(2)}%`);
        console.log(`         ${j.titre}`);
      });
    } else {
      console.log('   ⚠️  No jurisprudence found after filtering!');
    }

    return results;

  } catch (error) {
    console.error('   ❌ Error in searchRelevantJurisprudence:', error);
    return [];
  }
}

/**
 * Search for relevant methodology resources (pedagogical content)
 */
async function searchMethodologyResources(
  queryEmbedding: number[],
  limit: number = 3,
  matchThreshold: number = 0.60  // LOWERED from 0.65 to 0.60 for better recall
): Promise<MethodologyResource[]> {
  try {
    console.log(`\n   📚 METHODOLOGY SEARCH`);
    console.log(`      • Limit: ${limit}`);
    console.log(`      • Threshold: ${matchThreshold}`);

    const { data, error } = await supabaseServer
      .from('methodology_resources')
      .select('*')
      .not('embedding', 'is', null)
      .limit(200); // Fetch for similarity calculation

    if (error) {
      console.error('   ❌ Error searching methodologies:', error);
      return [];
    }

    console.log(`   ✅ Retrieved ${data?.length || 0} methodologies with embeddings`);

    if (!data || data.length === 0) {
      console.log('   ⚠️  No methodologies found in database');
      return [];
    }

    // Calculate similarity
    const allResults = data.map((methodology: any) => {
      // Parse embedding if it's a string (pgvector format)
      let embedding: number[];
      if (typeof methodology.embedding === 'string') {
        embedding = JSON.parse(methodology.embedding);
      } else if (Array.isArray(methodology.embedding)) {
        embedding = methodology.embedding;
      } else {
        console.warn(`   ⚠️  Invalid embedding format for methodology ${methodology.id}`);
        embedding = [];
      }

      let dotProduct = 0;
      let mag1 = 0;
      let mag2 = 0;

      for (let i = 0; i < queryEmbedding.length && i < embedding.length; i++) {
        dotProduct += queryEmbedding[i] * embedding[i];
        mag1 += queryEmbedding[i] * queryEmbedding[i];
        mag2 += embedding[i] * embedding[i];
      }

      const similarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));

      return {
        id: methodology.id,
        type: methodology.type,
        category: methodology.category,
        subcategory: methodology.subcategory,
        title: methodology.title,
        content: methodology.content,
        keywords: methodology.keywords || [],
        level: methodology.level,
        duration_minutes: methodology.duration_minutes,
        points_notation: methodology.points_notation,
        related_legal_concepts: methodology.related_legal_concepts || [],
        example_cases: methodology.example_cases || [],
        similarity: similarity,
      };
    });

    // DEBUG: Show top similarities
    const sorted = [...allResults].sort((a, b) => b.similarity - a.similarity);
    console.log(`\n   🔍 DEBUG - Top 5 methodology similarity scores:`);
    sorted.slice(0, 5).forEach((m, idx) => {
      console.log(`      ${idx + 1}. ${m.title.substring(0, 40)}: ${m.similarity.toFixed(4)} ${m.similarity >= matchThreshold ? '✅' : '❌'}`);
    });

    const results = allResults
      .filter(m => m.similarity >= matchThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`\n   ✅ Filtered to ${results.length} methodologies above threshold (≥${matchThreshold})`);

    if (results.length > 0) {
      console.log(`\n   📋 Top methodology results:`);
      results.forEach((m, idx) => {
        console.log(`      ${idx + 1}. ${m.category} - ${m.type} - ${(m.similarity * 100).toFixed(2)}%`);
        console.log(`         ${m.title}`);
      });
    } else {
      console.log('   ⚠️  No methodologies found after filtering!');
    }

    return results;

  } catch (error) {
    console.error('   ❌ Error in searchMethodologyResources:', error);
    return [];
  }
}

/**
 * Main RAG function: Search for relevant sources (articles + jurisprudence + methodologies)
 *
 * @param question - User question
 * @param options - Search options
 * @returns Relevant articles, jurisprudence, and methodologies
 */
export async function searchRelevantSources(
  question: string,
  options: {
    maxArticles?: number;
    maxJurisprudence?: number;
    maxMethodologies?: number;
    articleThreshold?: number;
    jurisprudenceThreshold?: number;
    methodologyThreshold?: number;
  } = {}
): Promise<RelevantSources> {
  const {
    maxArticles = 3,  // REDUCED from 20 to 3 for better precision
    maxJurisprudence = 8,  // INCREASED from 5 to 8 for better jurisprudence coverage
    maxMethodologies = 3,
    articleThreshold = 0.75,  // INCREASED from 0.65 to 0.75 for better precision
    jurisprudenceThreshold = 0.40,  // LOWERED from 0.50 to 0.40 for better recall
    methodologyThreshold = 0.60,  // LOWERED from 0.65 to 0.60 to include 5 more relevant methodologies (scores 0.6085-0.6155)
  } = options;

  try {
    // 1. Generate embedding for the question
    console.log(`\n   🔮 Generating embedding for question...`);
    console.log(`      Query: "${question.substring(0, 100)}${question.length > 100 ? '...' : ''}"`);

    const queryEmbedding = await generateEmbedding(question);
    console.log(`   ✅ Embedding generated: ${queryEmbedding.length} dimensions`);
    console.log(`      Sample values: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}, ...]`);

    // 2. Search in parallel for articles, jurisprudence, and methodologies
    console.log('\n   🔍 Searching for similar content in database...');
    const [articles, jurisprudence, methodologies] = await Promise.all([
      searchRelevantArticles(question, queryEmbedding, maxArticles, articleThreshold),
      searchRelevantJurisprudence(queryEmbedding, maxJurisprudence, jurisprudenceThreshold),
      searchMethodologyResources(queryEmbedding, maxMethodologies, methodologyThreshold),
    ]);

    console.log(`\n   📊 Search results:`);
    console.log(`      • Articles found: ${articles.length}`);
    console.log(`      • Jurisprudence found: ${jurisprudence.length}`);
    console.log(`      • Methodologies found: ${methodologies.length}`);
    console.log(`      • Total sources: ${articles.length + jurisprudence.length + methodologies.length}`);

    return {
      articles,
      jurisprudence,
      methodologies,
      query: question,
      totalSources: articles.length + jurisprudence.length + methodologies.length,
    };
  } catch (error) {
    console.error('\n   ❌ Error in searchRelevantSources:', error);
    if (error instanceof Error) {
      console.error(`      Error message: ${error.message}`);
      console.error(`      Stack trace: ${error.stack}`);
    }
    return {
      articles: [],
      jurisprudence: [],
      methodologies: [],
      query: question,
      totalSources: 0,
    };
  }
}

// ============================================================================
// Formatting Functions for Prompts
// ============================================================================

/**
 * Format articles for inclusion in the system prompt
 */
export function formatArticlesForPrompt(articles: RelevantArticle[]): string {
  if (articles.length === 0) {
    return '';
  }

  const formattedArticles = articles
    .map((article, index) => {
      const title = article.title ? ` - ${article.title}` : '';
      const code = article.code ? ` (${article.code})` : '';
      return `${index + 1}. Article ${article.article_number}${title}${code}
   Contenu : ${article.content}
   Pertinence : ${(article.similarity * 100).toFixed(1)}%`;
    })
    .join('\n\n');

  return `ARTICLES JURIDIQUES PERTINENTS :

${formattedArticles}`;
}

/**
 * Format jurisprudence for inclusion in the system prompt
 */
export function formatJurisprudenceForPrompt(jurisprudence: RelevantJurisprudence[]): string {
  if (jurisprudence.length === 0) {
    return '';
  }

  const formattedJurisprudence = jurisprudence
    .map((arret, index) => {
      const nomUsuel = arret.nom_usuel ? ` (${arret.nom_usuel})` : '';
      const importance = arret.importance ? ` [${arret.importance.toUpperCase()}]` : '';
      return `${index + 1}. ${arret.juridiction} - ${arret.date}${nomUsuel}${importance}
   Numéro : ${arret.numero}
   Titre : ${arret.titre}
   Principe : ${arret.principe}
   Solution : ${arret.solution}
   Articles liés : ${arret.articles_lies.join(', ')}
   Pertinence : ${(arret.similarity * 100).toFixed(1)}%`;
    })
    .join('\n\n');

  return `JURISPRUDENCE PERTINENTE :

${formattedJurisprudence}`;
}

/**
 * Format methodologies for inclusion in the system prompt
 */
export function formatMethodologiesForPrompt(methodologies: MethodologyResource[]): string {
  if (methodologies.length === 0) {
    return '';
  }

  const formattedMethodologies = methodologies
    .map((m, index) => {
      const level = m.level ? ` [Niveau: ${m.level}]` : '';
      const duration = m.duration_minutes ? ` (Durée: ${m.duration_minutes}min)` : '';
      const points = m.points_notation ? ` (Barème: ${m.points_notation} points)` : '';
      return `${index + 1}. ${m.title}${level}${duration}${points}
   Type: ${m.type} | Catégorie: ${m.category}${m.subcategory ? ` | ${m.subcategory}` : ''}

   ${m.content}

   Mots-clés: ${m.keywords.join(', ')}
   Pertinence: ${(m.similarity * 100).toFixed(1)}%`;
    })
    .join('\n\n─────────────────────────────────────────────────────────────\n\n');

  return `📚 MÉTHODOLOGIES PÉDAGOGIQUES DISPONIBLES :

${formattedMethodologies}`;
}

/**
 * Format all sources (articles + jurisprudence + methodologies) for the prompt
 * ULTRA STRICT VERSION - Best practices from RAG guidelines
 */
export function formatSourcesForPrompt(sources: RelevantSources): string {
  const parts: string[] = [];

  // Add methodologies FIRST if present (pedagogical priority)
  if (sources.methodologies && sources.methodologies.length > 0) {
    parts.push(formatMethodologiesForPrompt(sources.methodologies));
  }

  if (sources.articles.length > 0) {
    parts.push(formatArticlesForPrompt(sources.articles));
  }

  if (sources.jurisprudence.length > 0) {
    parts.push(formatJurisprudenceForPrompt(sources.jurisprudence));
  }

  if (parts.length === 0) {
    return '';
  }

  // If methodologies are present, use a pedagogical context
  const hasPedagogicalContent = sources.methodologies && sources.methodologies.length > 0;

  if (hasPedagogicalContent) {
    return `
╔══════════════════════════════════════════════════════════════════════╗
║   MODE PÉDAGOGIQUE - MÉTHODOLOGIES ET SOURCES JURIDIQUES            ║
╚══════════════════════════════════════════════════════════════════════╝

⚠️ CONTEXTE : L'utilisateur demande de l'aide méthodologique.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎓 TON RÔLE : Expert juridique ET pédagogue
Tu dois structurer ta réponse de façon claire et didactique.

📋 OBLIGATIONS PÉDAGOGIQUES :
1. ✅ UTILISER les méthodologies ci-dessous pour structurer ta réponse
2. ✅ FOURNIR des gabarits/templates si demandés
3. ✅ DONNER des conseils pratiques et exemples concrets
4. ✅ ALERTER sur les erreurs fréquentes à éviter
5. ✅ ÊTRE progressif : commencer par les bases, puis approfondir
6. ✅ CITER les sources juridiques pertinentes si disponibles

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${parts.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ VALIDATION PÉDAGOGIQUE : Assure-toi que ta réponse :
   ☑ Suit la méthodologie fournie ci-dessus
   ☑ Est structurée et progressive
   ☑ Contient des exemples et conseils pratiques
   ☑ Mentionne les erreurs à éviter
   ☑ Cite les sources juridiques si pertinentes
`;
  }

  // Standard legal mode (no pedagogical content)
  return `
╔══════════════════════════════════════════════════════════════════════╗
║   SOURCES JURIDIQUES VÉRIFIÉES - BASE DE CONNAISSANCE EXCLUSIVE     ║
╚══════════════════════════════════════════════════════════════════════╝

⚠️ RÈGLE ABSOLUE ET NON NÉGOCIABLE :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 INTERDICTIONS ABSOLUES :
• Tu NE DOIS JAMAIS inventer ou mentionner des articles qui ne sont PAS listés ci-dessous
• Tu NE DOIS JAMAIS paraphraser sans citer le contenu EXACT de l'article
• Tu NE DOIS JAMAIS répondre sans avoir cité AU MOINS UN article de cette liste
• Tu NE DOIS JAMAIS dire "je ne sais pas" ou "je ne connais pas" si des articles sont fournis
• TOUTE affirmation juridique DOIT être sourcée par un article ou une décision ci-dessous

🟢 OBLIGATIONS STRICTES :
1. ✅ COMMENCER PAR : "Selon le Code civil et la jurisprudence, voici la réponse :"
2. ✅ CITER les ARTICLES avec leur CONTENU EXACT : "L'Article [numéro] dispose que : « [contenu] »"
3. ✅ CITER OBLIGATOIREMENT LA JURISPRUDENCE si elle est fournie ci-dessous
4. ✅ FORMAT JURISPRUDENCE : "[Juridiction], [Date] : [Principe résumé]"
5. ✅ EXPLIQUER l'application concrète de chaque source citée
6. ✅ AJOUTER les liens Légifrance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 ARTICLES JURIDIQUES DISPONIBLES (SOURCE PRIMAIRE) :

${sources.articles.map((a, idx) => `
📌 Article ${a.article_number} ${a.code ? `du ${a.code}` : ''}
   ${a.title && a.title !== `Article ${a.article_number}` ? `Titre: ${a.title}` : ''}
   ${a.section_path ? `Section: ${a.section_path}` : ''}

   📜 CONTENU INTÉGRAL (à citer exactement) :
   « ${a.content} »

   🔗 Lien Légifrance: ${a.legifranceUrl}
   📊 Score de pertinence: ${(a.similarity * 100).toFixed(1)}%
`).join('\n')}

${sources.jurisprudence.length > 0 ? `
⚖️⚖️⚖️ JURISPRUDENCE DISPONIBLE (À CITER OBLIGATOIREMENT !) ⚖️⚖️⚖️

⚠️ RÈGLE IMPÉRATIVE : Tu DOIS citer AU MOINS UNE décision de jurisprudence ci-dessous dans ta réponse !
La jurisprudence précise et illustre l'application concrète des articles. Tu dois l'utiliser.

${sources.jurisprudence.map((j, idx) => `
📌 DÉCISION ${idx + 1} : ${j.juridiction} - ${j.date}${j.nom_usuel ? ` (${j.nom_usuel})` : ''}
   Titre: ${j.titre}
   Numéro: ${j.numero}

   📜 PRINCIPE DE LA DÉCISION (à citer dans ta réponse) :
   "${j.principe}"

   📜 SOLUTION RETENUE :
   "${j.solution}"

   🔗 Lien Légifrance: ${j.legifranceUrl}
   📊 Pertinence: ${(j.similarity * 100).toFixed(1)}%
`).join('\n')}

⚠️ RAPPEL : Tu DOIS mentionner AU MOINS UNE de ces décisions dans ta réponse !
Format attendu : "La jurisprudence a précisé ce point : [Juridiction], [Date] : [Principe]"
` : ''}

╔══════════════════════════════════════════════════════════════════════╗
║                    EXEMPLE DE RÉPONSE CORRECTE                       ║
╚══════════════════════════════════════════════════════════════════════╝

Selon ${sources.articles[0]?.code || 'le Code civil'}, voici les articles applicables :

L'Article ${sources.articles[0]?.article_number} ${sources.articles[0]?.code ? `du ${sources.articles[0].code}` : ''} dispose que : « ${sources.articles[0]?.content?.substring(0, 100)}... »

[Lien Légifrance: ${sources.articles[0]?.legifranceUrl}]

Cet article signifie que...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ VALIDATION : Avant d'envoyer ta réponse, vérifie que :
   ☑ Tu as commencé par la phrase obligatoire
   ☑ Tu as cité au moins un article avec son CONTENU EXACT
   ☑ Tu as ajouté les liens Légifrance
   ☑ Tu n'as mentionné AUCUN article absent de cette liste
   ☑ Chaque affirmation juridique est sourcée

Si un seul de ces critères n'est pas respecté, ta réponse est INCORRECTE.
`;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get statistics about available sources in the database
 */
export async function getSourceStatistics() {
  try {
    // Count articles
    const { count: articlesCount } = await supabaseServer
      .from('legal_articles')
      .select('*', { count: 'exact', head: true });

    // Count articles with embeddings
    const { count: articlesWithEmbeddings } = await supabaseServer
      .from('legal_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    // Count jurisprudence
    const { count: jurisprudenceCount } = await supabaseServer
      .from('case_law')
      .select('*', { count: 'exact', head: true });

    // Count jurisprudence with embeddings
    const { count: jurisprudenceWithEmbeddings } = await supabaseServer
      .from('case_law')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    return {
      articles: {
        total: articlesCount || 0,
        withEmbeddings: articlesWithEmbeddings || 0,
        ready: (articlesWithEmbeddings || 0) > 0,
      },
      jurisprudence: {
        total: jurisprudenceCount || 0,
        withEmbeddings: jurisprudenceWithEmbeddings || 0,
        ready: (jurisprudenceWithEmbeddings || 0) > 0,
      },
      totalSources: (articlesCount || 0) + (jurisprudenceCount || 0),
      ready: (articlesWithEmbeddings || 0) > 0 || (jurisprudenceWithEmbeddings || 0) > 0,
    };
  } catch (error) {
    console.error('Error getting source statistics:', error);
    return {
      articles: { total: 0, withEmbeddings: 0, ready: false },
      jurisprudence: { total: 0, withEmbeddings: 0, ready: false },
      totalSources: 0,
      ready: false,
    };
  }
}
