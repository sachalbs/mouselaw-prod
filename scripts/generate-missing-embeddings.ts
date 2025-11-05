/**
 * Script pour générer les embeddings manquants des articles juridiques
 *
 * Usage:
 *   npx tsx scripts/generate-missing-embeddings.ts --code=code_civil --limit=100
 *   npx tsx scripts/generate-missing-embeddings.ts --code=code_civil
 *   npx tsx scripts/generate-missing-embeddings.ts
 */

import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables d\'environnement manquantes');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// Mistral Embedding (copié localement pour éviter d'importer lib/supabase/server)
// ============================================================================

const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings';
const MISTRAL_EMBED_MODEL = 'mistral-embed';

interface EmbeddingResponse {
  id: string;
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Generate an embedding vector for a given text using Mistral Embed API
 * @param text - The text to embed
 * @returns The embedding vector (1024 dimensions)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

  try {
    const response = await fetch(MISTRAL_EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MISTRAL_EMBED_MODEL,
        input: [text],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mistral Embed API error: ${response.status} - ${errorText}`
      );
    }

    const data: EmbeddingResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      throw new Error('No embedding returned from Mistral Embed API');
    }

    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// ============================================================================
// Types et Interfaces
// ============================================================================

interface Article {
  id: string;
  article_number: string;
  title: string | null;
  content: string;
  code_id: string;
  code_name: string;
  display_name: string;
}

interface Stats {
  processed: number;
  succeeded: number;
  failed: number;
  errors429: number;
  totalPauseTime: number;
  startTime: number;
  requestsLastMinute: number[];
}

interface Options {
  code?: string;
  limit?: number;
}

// ============================================================================
// Parsing des Arguments CLI
// ============================================================================

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {};

  args.forEach(arg => {
    if (arg.startsWith('--code=')) {
      options.code = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    }
  });

  return options;
}

// ============================================================================
// Utilitaires
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function calculateETA(processed: number, total: number, elapsedMs: number): string {
  if (processed === 0) return 'Calcul...';

  const remainingItems = total - processed;
  const msPerItem = elapsedMs / processed;
  const remainingMs = remainingItems * msPerItem;

  return formatDuration(remainingMs);
}

function displayProgress(stats: Stats, total: number, current: Article) {
  const percentage = ((stats.processed / total) * 100).toFixed(1);
  const elapsed = Date.now() - stats.startTime;
  const eta = calculateETA(stats.processed, total, elapsed);
  const speed = stats.processed > 0 ? ((stats.processed / elapsed) * 60000).toFixed(1) : '0';

  console.log(`\n[${'='.repeat(40)}] ${percentage}%`);
  console.log(`📊 Progression : ${stats.processed}/${total} embeddings`);
  console.log(`⚡ Vitesse : ~${speed} embeddings/min`);
  console.log(`⏱️  ETA : ${eta}`);
  console.log(`✅ Succès : ${stats.succeeded} | ❌ Échecs : ${stats.failed} | ⚠️  Erreurs 429 : ${stats.errors429}`);
  if (stats.totalPauseTime > 0) {
    console.log(`⏸️  Temps total en pause : ${formatDuration(stats.totalPauseTime)}`);
  }
  console.log(`\n🔄 En cours : Article ${current.article_number} (${current.code_name})`);
  console.log(`   "${current.content.substring(0, 80)}..."`);
}

// ============================================================================
// Gestion des Rate Limits
// ============================================================================

class RateLimiter {
  private requestTimes: number[] = [];
  private readonly maxRequestsPerMinute = 50;
  private currentDelay = 2000; // 2 secondes par défaut
  private readonly minDelay = 2000;
  private readonly maxDelay = 60000;

  async waitIfNeeded(): Promise<number> {
    // Nettoyer les requêtes de plus d'une minute
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimes = this.requestTimes.filter(t => t > oneMinuteAgo);

    // Si on approche de la limite, pause forcée
    if (this.requestTimes.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = 61000 - (Date.now() - oldestRequest);

      if (waitTime > 0) {
        console.log(`\n⚠️  RATE LIMIT PRÉVENTIF : ${this.requestTimes.length} requêtes dans la dernière minute`);
        console.log(`⏸️  Pause forcée de ${formatDuration(waitTime)} pour éviter le rate limit...`);
        await sleep(waitTime);
        return waitTime;
      }
    }

    // Attente normale entre les requêtes
    await sleep(this.currentDelay);

    // Enregistrer la requête
    this.requestTimes.push(Date.now());

    return 0;
  }

  async handleError429(): Promise<number> {
    // Augmenter le délai exponentiellement
    this.currentDelay = Math.min(this.currentDelay * 2, this.maxDelay);

    console.log(`\n⚠️  ERREUR 429 : Rate limit atteint`);
    console.log(`⏸️  Pause de ${formatDuration(this.currentDelay)}...`);
    console.log(`📊 Prochain délai : ${formatDuration(this.currentDelay)}`);

    await sleep(this.currentDelay);
    return this.currentDelay;
  }

  onSuccess() {
    // Réduire progressivement le délai en cas de succès
    if (this.currentDelay > this.minDelay) {
      this.currentDelay = Math.max(this.minDelay, this.currentDelay * 0.9);
    }
  }

  getRequestsPerMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    return this.requestTimes.filter(t => t > oneMinuteAgo).length;
  }
}

// ============================================================================
// Fonctions Principales
// ============================================================================

async function fetchMissingArticles(options: Options): Promise<Article[]> {
  console.log('\n📊 Récupération des articles sans embeddings...');

  let query = supabase
    .from('legal_articles')
    .select(`
      id,
      article_number,
      title,
      content,
      code_id,
      legal_codes!inner (
        code_name,
        display_name
      )
    `)
    .is('embedding', null)
    .order('article_number', { ascending: true });

  // Filtrer par code si spécifié
  if (options.code) {
    query = query.eq('legal_codes.code_name', options.code);
  }

  // Limiter si spécifié
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ Erreur lors de la récupération:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    console.log('✅ Aucun article sans embedding trouvé !');
    return [];
  }

  // Formater les données
  const articles: Article[] = data.map((row: any) => ({
    id: row.id,
    article_number: row.article_number,
    title: row.title,
    content: row.content,
    code_id: row.code_id,
    code_name: row.legal_codes.code_name,
    display_name: row.legal_codes.display_name,
  }));

  console.log(`✅ ${articles.length} articles trouvés sans embeddings`);
  if (options.code) {
    console.log(`   Code : ${articles[0].display_name}`);
  }

  return articles;
}

async function generateEmbeddingForArticle(
  article: Article,
  rateLimiter: RateLimiter,
  stats: Stats
): Promise<boolean> {
  try {
    // Attendre selon le rate limiter
    const pauseTime = await rateLimiter.waitIfNeeded();
    stats.totalPauseTime += pauseTime;

    // Générer l'embedding
    const textToEmbed = `Article ${article.article_number} du ${article.display_name}
${article.title || ''}

${article.content}`;

    const embedding = await generateEmbedding(textToEmbed);

    // Sauvegarder dans la base
    const { error } = await supabase
      .from('legal_articles')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', article.id);

    if (error) {
      console.error(`❌ Erreur DB pour article ${article.article_number}:`, error.message);
      stats.failed++;
      return false;
    }

    // Succès
    rateLimiter.onSuccess();
    stats.succeeded++;
    return true;

  } catch (error: any) {
    // Erreur 429 : Rate limit
    if (error.message?.includes('429') || error.message?.includes('rate')) {
      stats.errors429++;
      const pauseTime = await rateLimiter.handleError429();
      stats.totalPauseTime += pauseTime;

      // Réessayer
      return await generateEmbeddingForArticle(article, rateLimiter, stats);
    }

    // Autre erreur
    console.error(`❌ Erreur pour article ${article.article_number}:`, error.message);
    stats.failed++;
    return false;
  }
}

async function saveCheckpoint(stats: Stats, total: number) {
  const checkpoint = {
    timestamp: new Date().toISOString(),
    processed: stats.processed,
    total: total,
    percentage: ((stats.processed / total) * 100).toFixed(1),
    succeeded: stats.succeeded,
    failed: stats.failed,
    errors429: stats.errors429,
  };

  console.log(`\n💾 CHECKPOINT : ${checkpoint.processed}/${checkpoint.total} (${checkpoint.percentage}%)`);
}

// ============================================================================
// Fonction Principale
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   GÉNÉRATION DES EMBEDDINGS MANQUANTS                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Parser les arguments
  const options = parseArgs();

  console.log('⚙️  Configuration :');
  if (options.code) {
    console.log(`   • Code ciblé : ${options.code}`);
  } else {
    console.log('   • Code ciblé : TOUS');
  }
  if (options.limit) {
    console.log(`   • Limite : ${options.limit} articles`);
  } else {
    console.log('   • Limite : AUCUNE (tous les articles)');
  }

  // Récupérer les articles manquants
  const articles = await fetchMissingArticles(options);

  if (articles.length === 0) {
    console.log('\n✅ Tous les embeddings sont déjà générés !');
    process.exit(0);
  }

  // Confirmation
  console.log(`\n⚠️  Vous allez générer ${articles.length} embeddings.`);
  console.log('   Temps estimé : ~' + formatDuration(articles.length * 2000));
  console.log('\n🚀 Démarrage dans 3 secondes...\n');
  await sleep(3000);

  // Initialiser les stats et le rate limiter
  const stats: Stats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors429: 0,
    totalPauseTime: 0,
    startTime: Date.now(),
    requestsLastMinute: [],
  };

  const rateLimiter = new RateLimiter();

  // Traiter chaque article
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    // Afficher la progression
    displayProgress(stats, articles.length, article);

    // Générer l'embedding
    const success = await generateEmbeddingForArticle(article, rateLimiter, stats);

    stats.processed++;

    // Checkpoint tous les 100 articles
    if (stats.processed % 100 === 0) {
      await saveCheckpoint(stats, articles.length);
    }
  }

  // Résumé final
  const totalTime = Date.now() - stats.startTime;
  const avgSpeed = (stats.processed / totalTime) * 60000;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   GÉNÉRATION TERMINÉE                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 STATISTIQUES FINALES :');
  console.log(`   • Total traité : ${stats.processed} articles`);
  console.log(`   • ✅ Succès : ${stats.succeeded} (${((stats.succeeded / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`   • ❌ Échecs : ${stats.failed} (${((stats.failed / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`   • ⚠️  Erreurs 429 : ${stats.errors429}`);
  console.log(`   • ⏱️  Temps total : ${formatDuration(totalTime)}`);
  console.log(`   • ⏸️  Temps en pause : ${formatDuration(stats.totalPauseTime)}`);
  console.log(`   • ⚡ Vitesse moyenne : ${avgSpeed.toFixed(1)} embeddings/min`);

  if (stats.failed > 0) {
    console.log('\n⚠️  Relancez le script pour réessayer les articles échoués.');
  } else {
    console.log('\n✅ Tous les embeddings ont été générés avec succès !');
  }
}

// Lancer le script
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ ERREUR FATALE:', err);
    process.exit(1);
  });
