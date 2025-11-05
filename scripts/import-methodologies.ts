/**
 * Import méthodologies pédagogiques depuis data/methodologies.json
 *
 * Usage:
 *   npx tsx scripts/import-methodologies.ts
 *   npx tsx scripts/import-methodologies.ts --limit=5
 *
 * Source: data/methodologies.json
 * Fonctionnalités:
 * - Import des méthodologies juridiques (commentaire d'arrêt, cas pratique, etc.)
 * - Génération automatique des embeddings Mistral pour RAG
 * - Gestion des rate limits API Mistral (429)
 * - Retry automatique avec backoff exponentiel
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const METHODOLOGIES_FILE = resolve(process.cwd(), 'data', 'methodologies.json');
const BATCH_SIZE = 10;
const EMBEDDING_DELAY = 2500; // 2.5s entre chaque embedding
const RETRY_DELAY = 5000; // 5s de base pour retry
const MAX_RETRIES = 3;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// MISTRAL EMBEDDING (copié localement pour éviter import lib/supabase/server)
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

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

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
}

// ============================================================================
// TYPES
// ============================================================================

interface MethodologyInput {
  type: 'methodology' | 'template' | 'tip' | 'checklist' | 'example';
  category: 'commentaire_arret' | 'cas_pratique' | 'dissertation' | 'fiche_arret' | 'note_synthese';
  subcategory?: string;
  title: string;
  content: string;
  keywords: string[];
  level?: 'L1' | 'L2' | 'L3' | 'M1' | 'M2' | 'CRFPA' | 'Tous';
  duration_minutes?: number;
  points_notation?: number;
  related_legal_concepts?: string[];
  example_cases?: string[];
}

interface MethodologyRecord {
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
  embedding: number[];
}

interface Stats {
  processed: number;
  succeeded: number;
  failed: number;
  errors429: number;
  skipped: number;
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

async function loadMethodologies(): Promise<MethodologyInput[]> {
  console.log(`📂 Lecture du fichier ${METHODOLOGIES_FILE}...`);

  const fileContent = readFileSync(METHODOLOGIES_FILE, 'utf-8');
  const methodologies = JSON.parse(fileContent) as MethodologyInput[];

  console.log(`✅ ${methodologies.length} méthodologies chargées\n`);

  return methodologies;
}

async function generateEmbeddingWithRetry(
  text: string,
  retryCount: number = 0
): Promise<number[]> {
  try {
    return await generateEmbedding(text);
  } catch (error: any) {
    if (error.message.includes('429') && retryCount < MAX_RETRIES) {
      const backoffDelay = RETRY_DELAY * Math.pow(2, retryCount);
      console.log(
        `⚠️  Rate limit (429) - Retry ${retryCount + 1}/${MAX_RETRIES} dans ${backoffDelay / 1000}s...`
      );
      await sleep(backoffDelay);
      return generateEmbeddingWithRetry(text, retryCount + 1);
    }
    throw error;
  }
}

async function importMethodology(
  methodology: MethodologyInput,
  stats: Stats
): Promise<void> {
  try {
    // Vérifier si la méthodologie existe déjà (par titre exact)
    const { data: existing } = await supabase
      .from('methodology_resources')
      .select('id')
      .eq('title', methodology.title)
      .single();

    if (existing) {
      console.log(`⏭️  Déjà importée: ${methodology.title}`);
      stats.skipped++;
      return;
    }

    // Générer l'embedding
    console.log(`🔄 Traitement: ${methodology.title}`);
    console.log(`   Type: ${methodology.type} | Catégorie: ${methodology.category}`);

    const embedding = await generateEmbeddingWithRetry(methodology.content);

    // Préparer l'enregistrement
    const record: MethodologyRecord = {
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
      embedding,
    };

    // Insérer dans Supabase
    const { error } = await supabase
      .from('methodology_resources')
      .insert([record]);

    if (error) {
      throw error;
    }

    console.log(`✅ Importée avec succès\n`);
    stats.succeeded++;

    // Délai entre les appels API
    await sleep(EMBEDDING_DELAY);
  } catch (error: any) {
    console.error(`❌ Erreur lors de l'import de "${methodology.title}":`, error.message);
    stats.failed++;

    if (error.message.includes('429')) {
      stats.errors429++;
    }
  }

  stats.processed++;
}

async function importAllMethodologies(limit?: number): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   IMPORT DES MÉTHODOLOGIES PÉDAGOGIQUES                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  const stats: Stats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors429: 0,
    skipped: 0,
  };

  // Charger les méthodologies
  const methodologies = await loadMethodologies();

  // Limiter si demandé
  const toProcess = limit ? methodologies.slice(0, limit) : methodologies;

  console.log(`📊 Méthodologies à importer: ${toProcess.length}`);
  if (limit) {
    console.log(`⚠️  Mode limité activé (--limit=${limit})`);
  }
  console.log('');

  // Traiter chaque méthodologie
  for (const methodology of toProcess) {
    await importMethodology(methodology, stats);
  }

  // Résumé final
  const duration = Date.now() - startTime;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   IMPORT TERMINÉ                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 STATISTIQUES FINALES:');
  console.log(`   • Total traité     : ${stats.processed}`);
  console.log(`   • ✅ Succès         : ${stats.succeeded} (${((stats.succeeded / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`   • ⏭️  Ignorées       : ${stats.skipped}`);
  console.log(`   • ❌ Échecs         : ${stats.failed} (${((stats.failed / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`   • ⚠️  Erreurs 429   : ${stats.errors429}`);
  console.log(`   • ⏱️  Temps total    : ${formatDuration(duration)}`);
  console.log('');

  if (stats.succeeded === toProcess.length) {
    console.log('✅ Toutes les méthodologies ont été importées avec succès !');
  } else if (stats.failed > 0) {
    console.log('⚠️  Certaines méthodologies n\'ont pas pu être importées.');
  }

  console.log('');
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  try {
    await importAllMethodologies(limit);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  }
}

main();
