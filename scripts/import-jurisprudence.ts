#!/usr/bin/env tsx

/**
 * Import jurisprudence (case law) from JSON file with embeddings
 *
 * This script:
 * 1. Reads jurisprudence from data/jurisprudence-complete.json
 * 2. Inserts them into Supabase database
 * 3. Generates embeddings for vector search
 *
 * Usage:
 *   npx tsx scripts/import-jurisprudence.ts
 *   npx tsx scripts/import-jurisprudence.ts --skip-embeddings
 *   npx tsx scripts/import-jurisprudence.ts --replace
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Parse command line arguments
const args = process.argv.slice(2);
const shouldReplace = args.includes('--replace');
const skipEmbeddings = args.includes('--skip-embeddings');

// JSON file path
const JSON_FILE_PATH = path.join(process.cwd(), 'data', 'jurisprudence-complete.json');

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

interface JsonArret {
  juridiction: string;
  date: string;
  numero: string;
  nom_usuel?: string;
  titre: string;
  faits: string;
  solution: string;
  principe: string;
  articles_lies: string[];
  categorie: string;
  importance: string;
  mots_cles: string[];
}

interface DatabaseArret {
  juridiction: string;
  date: string;
  numero: string;
  nom_usuel: string | null;
  titre: string;
  faits: string;
  solution: string;
  principe: string;
  articles_lies: string[];
  categorie: string;
  importance: string;
  mots_cles: string[];
}

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
}

/**
 * Read jurisprudence from JSON file
 */
function readJurisprudenceFromJson(): JsonArret[] {
  console.log(`📖 Reading jurisprudence from ${JSON_FILE_PATH}...`);

  if (!fs.existsSync(JSON_FILE_PATH)) {
    throw new Error(`JSON file not found: ${JSON_FILE_PATH}`);
  }

  const jsonContent = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
  const data = JSON.parse(jsonContent);

  if (!data.arrets || !Array.isArray(data.arrets)) {
    throw new Error('Invalid JSON format: expected { arrets: [...] }');
  }

  console.log(`✅ Loaded ${data.arrets.length} arrêts from JSON file`);
  return data.arrets;
}

/**
 * Map JSON arrêts to database format
 */
function mapArretsToDatabase(jsonArrets: JsonArret[]): DatabaseArret[] {
  return jsonArrets.map((arret) => ({
    juridiction: arret.juridiction,
    date: arret.date,
    numero: arret.numero,
    nom_usuel: arret.nom_usuel || null,
    titre: arret.titre,
    faits: arret.faits,
    solution: arret.solution,
    principe: arret.principe,
    articles_lies: arret.articles_lies,
    categorie: arret.categorie,
    importance: arret.importance,
    mots_cles: arret.mots_cles,
  }));
}

/**
 * Insert arrêts into Supabase database
 */
async function insertArrets(
  arrets: DatabaseArret[]
): Promise<{ imported: number; skipped: number; failed: number }> {
  console.log('\n📥 Inserting jurisprudence into database...\n');

  // Check for existing arrêts
  const { data: existingArrets } = await supabase
    .from('jurisprudence')
    .select('numero');

  const existingNumeros = new Set(existingArrets?.map((a) => a.numero) || []);

  // Filter out duplicates unless replace=true
  let arretsToInsert = arrets;
  let skipped = 0;

  if (!shouldReplace) {
    arretsToInsert = arrets.filter((arret) => {
      if (existingNumeros.has(arret.numero)) {
        skipped++;
        return false;
      }
      return true;
    });
  }

  console.log(
    `   Inserting ${arretsToInsert.length} arrêts (${skipped} skipped as duplicates)`
  );

  if (arretsToInsert.length === 0) {
    console.log('\n✅ All arrêts already exist in database\n');
    return { imported: 0, skipped, failed: 0 };
  }

  // Insert arrêts in batches of 50
  const batchSize = 50;
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < arretsToInsert.length; i += batchSize) {
    const batch = arretsToInsert.slice(i, i + batchSize);

    try {
      if (shouldReplace) {
        const { error } = await supabase
          .from('jurisprudence')
          .upsert(batch, {
            onConflict: 'numero',
          });

        if (error) {
          console.error(`   ❌ Error upserting batch ${i / batchSize + 1}:`, error.message);
          failed += batch.length;
        } else {
          imported += batch.length;
        }
      } else {
        const { error } = await supabase.from('jurisprudence').insert(batch);

        if (error) {
          console.error(`   ❌ Error inserting batch ${i / batchSize + 1}:`, error.message);
          failed += batch.length;
        } else {
          imported += batch.length;
        }
      }

      // Log progress
      const progress = Math.round(((i + batch.length) / arretsToInsert.length) * 100);
      process.stdout.write(
        `\r   Progress: ${progress}% (${i + batch.length}/${arretsToInsert.length} arrêts)`
      );
    } catch (error) {
      console.error('   ❌ Error inserting batch:', error);
      failed += batch.length;
    }
  }

  console.log('\n');
  return { imported, skipped, failed };
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

      const batchEmbeddings = data.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      results.push(...batchEmbeddings);

      // Update progress
      const progress = Math.round(((i + batch.length) / texts.length) * 100);
      process.stdout.write(
        `\r   Progress: ${progress}% (${i + batch.length}/${texts.length} embeddings)`
      );

      // Add delay to avoid rate limiting
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
 * Generate embeddings for arrêts without embeddings
 */
async function embedArrets(): Promise<{ processed: number; failed: number }> {
  console.log('\n🔮 Generating embeddings for jurisprudence...\n');

  // Fetch all arrêts without embeddings
  const { data: arrets, error: fetchError } = await supabase
    .from('jurisprudence')
    .select('id, numero, nom_usuel, titre, faits, solution, principe')
    .is('embedding', null)
    .order('date');

  if (fetchError) {
    console.error('   ❌ Error fetching jurisprudence:', fetchError);
    throw fetchError;
  }

  if (!arrets || arrets.length === 0) {
    console.log('   ✅ No jurisprudence needs embedding\n');
    return { processed: 0, failed: 0 };
  }

  console.log(`   Found ${arrets.length} arrêts without embeddings`);

  // Prepare texts for embedding
  // Combine all relevant fields for better semantic search
  const textsToEmbed = arrets.map((arret) => {
    const nomUsuel = arret.nom_usuel ? `Arrêt ${arret.nom_usuel}. ` : '';
    return `${nomUsuel}${arret.titre}. ${arret.principe}. ${arret.faits} ${arret.solution}`;
  });

  console.log('   Generating embeddings...\n');
  const embeddings = await generateBatchEmbeddings(textsToEmbed);

  console.log('   Updating database with embeddings...\n');

  // Update arrêts with their embeddings
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < arrets.length; i++) {
    const { error } = await supabase
      .from('jurisprudence')
      .update({ embedding: embeddings[i] })
      .eq('id', arrets[i].id);

    if (error) {
      console.error(`   ❌ Error updating arrêt ${arrets[i].numero}:`, error.message);
      failed++;
    } else {
      processed++;
    }

    // Update progress
    const progress = Math.round(((i + 1) / arrets.length) * 100);
    process.stdout.write(
      `\r   Progress: ${progress}% (${i + 1}/${arrets.length} arrêts updated)`
    );
  }

  console.log('\n');
  return { processed, failed };
}

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Mouse Law - Jurisprudence Import & Embedding       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (shouldReplace) {
    console.log('⚠️  REPLACE MODE - Existing arrêts will be replaced\n');
  } else {
    console.log('📝 IMPORT MODE - Skipping duplicate arrêts\n');
  }

  if (skipEmbeddings) {
    console.log('⏭️  SKIP EMBEDDINGS MODE - Arrêts will be imported without embeddings\n');
  }

  try {
    // Step 1: Read jurisprudence from JSON
    const jsonArrets = readJurisprudenceFromJson();

    // Step 2: Map to database format
    const dbArrets = mapArretsToDatabase(jsonArrets);

    // Step 3: Insert arrêts into database
    const { imported, skipped, failed } = await insertArrets(dbArrets);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  📊 IMPORT RESULTS                         ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total arrêts in JSON: ${jsonArrets.length}`);
    console.log(`   • Successfully imported: ${imported}`);
    console.log(`   • Skipped (duplicates): ${skipped}`);
    console.log(`   • Failed: ${failed}`);

    // Step 4: Generate embeddings (unless skipped)
    if (!skipEmbeddings) {
      const { processed, failed: embedFailed } = await embedArrets();

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('                  🔮 EMBEDDING RESULTS                      ');
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log(`   • Embeddings generated: ${processed}`);
      console.log(`   • Failed: ${embedFailed}`);
    }

    // Get final statistics
    const { count: totalCount } = await supabase
      .from('jurisprudence')
      .select('*', { count: 'exact', head: true });

    const { count: embeddedCount } = await supabase
      .from('jurisprudence')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  📊 DATABASE STATUS                        ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total jurisprudence: ${totalCount || 0}`);
    console.log(`   • With embeddings: ${embeddedCount || 0}`);
    console.log(`   • Without embeddings: ${(totalCount || 0) - (embeddedCount || 0)}`);
    console.log(
      `   • Ready for search: ${(totalCount || 0) - (embeddedCount || 0) === 0 ? 'Yes ✅' : 'No ❌'}`
    );

    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('🎉 Jurisprudence import complete!\n');
  } catch (error) {
    console.error('\n❌ Error during execution:', error);
    process.exit(1);
  }
}

// Run the script
main();
