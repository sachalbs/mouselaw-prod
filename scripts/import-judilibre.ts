/**
 * Import de jurisprudence depuis l'API Judilibre (Cour de Cassation)
 *
 * Usage:
 *   npx tsx scripts/import-judilibre.ts [--limit=100]
 *
 * API: https://api.piste.gouv.fr/cassation/judilibre/v1.0/
 * Table: case_law (jurisdiction_id, title, decision_date, summary, full_text, embedding)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const JUDILIBRE_API_URL = 'https://api.piste.gouv.fr/cassation/judilibre/v1.0';
const BATCH_SIZE = 50; // Pour insertions Supabase
const API_BATCH_SIZE = 100; // Taille des lots API Judilibre
const EMBEDDING_DELAY = 2000; // 2s entre batches d'embeddings
const RETRY_DELAY = 5000; // 5s si erreur 429

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TYPES
// ============================================================================

interface JudilibreDecision {
  id: string;
  text: string;
  summary?: string;
  decision_date: string;
  chamber?: string;
  formation?: string;
  number?: string;
  jurisdiction?: string;
  publication?: string[];
  solution?: string;
}

interface JudilibreSearchResponse {
  results: JudilibreDecision[];
  total: number;
  next_batch?: number;
}

interface CaseLawRecord {
  jurisdiction_id: string;
  title: string;
  decision_date: string;
  summary: string | null;
  full_text: string;
  source_id: string;
  source_api: string;
  metadata?: any;
}

interface ImportStats {
  total: number;
  imported: number;
  skipped: number;
  withEmbeddings: number;
  errors: number;
}

// ============================================================================
// AUTHENTIFICATION PISTE
// ============================================================================

async function getPisteToken(): Promise<string> {
  console.log('🔐 Obtention du token OAuth PISTE...');

  const credentials = Buffer.from(
    `${process.env.LEGIFRANCE_CLIENT_ID}:${process.env.LEGIFRANCE_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://oauth.piste.gouv.fr/api/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=openid',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur OAuth PISTE: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log('✅ Token OAuth obtenu');
  return data.access_token;
}

// ============================================================================
// RÉCUPÉRATION JUDILIBRE
// ============================================================================

async function searchJudilibre(
  token: string,
  batchNumber: number = 0,
  dateStart: string = '2020-01-01',
  dateEnd: string = '2025-12-31'
): Promise<JudilibreSearchResponse> {
  console.log(`\n📥 Récupération batch ${batchNumber + 1} (${API_BATCH_SIZE} décisions)...`);

  const requestBody = {
    query: '',
    date_start: dateStart,
    date_end: dateEnd,
    jurisdiction: ['cc'], // Cour de Cassation
    publication: ['b'], // Publiées au bulletin
    batch_size: API_BATCH_SIZE,
    batch: batchNumber,
  };

  console.log(`   📤 Requête: ${JUDILIBRE_API_URL}/search`);
  console.log(`   Période: ${dateStart} → ${dateEnd}`);

  const response = await fetch(`${JUDILIBRE_API_URL}/search`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'KeyId': process.env.LEGIFRANCE_CLIENT_ID!,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`   ❌ Erreur API Judilibre: ${response.status}`);
    console.error(`   Détails: ${errorText.substring(0, 500)}`);
    throw new Error(`Erreur API Judilibre: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`   ✅ ${data.results?.length || 0} décisions récupérées (total: ${data.total})`);

  return {
    results: data.results || [],
    total: data.total || 0,
    next_batch: data.next_batch,
  };
}

// ============================================================================
// JURIDICTIONS
// ============================================================================

async function getOrCreateJurisdiction(name: string): Promise<string> {
  // Essayer de trouver la juridiction
  const { data: existing, error: searchError } = await supabase
    .from('jurisdictions')
    .select('id')
    .eq('name', name)
    .single();

  if (existing) {
    return existing.id;
  }

  // Créer si n'existe pas
  const { data: created, error: createError } = await supabase
    .from('jurisdictions')
    .insert([{ name }])
    .select('id')
    .single();

  if (createError || !created) {
    throw new Error(`Impossible de créer la juridiction ${name}: ${createError?.message}`);
  }

  console.log(`   ✅ Juridiction créée: ${name}`);
  return created.id;
}

// ============================================================================
// TRANSFORMATION DES DONNÉES
// ============================================================================

function buildDecisionTitle(decision: JudilibreDecision): string {
  const parts: string[] = [];

  if (decision.chamber) {
    parts.push(decision.chamber);
  }

  if (decision.decision_date) {
    const date = new Date(decision.decision_date);
    parts.push(date.toLocaleDateString('fr-FR'));
  }

  if (decision.number) {
    parts.push(`n° ${decision.number}`);
  }

  return parts.join(', ') || `Décision ${decision.id}`;
}

async function transformDecision(
  decision: JudilibreDecision,
  jurisdictionId: string
): Promise<CaseLawRecord> {
  return {
    jurisdiction_id: jurisdictionId,
    title: buildDecisionTitle(decision),
    decision_date: decision.decision_date,
    summary: decision.summary || null,
    full_text: decision.text,
    source_id: decision.id,
    source_api: 'judilibre',
    metadata: {
      chamber: decision.chamber,
      formation: decision.formation,
      number: decision.number,
      publication: decision.publication,
      solution: decision.solution,
    },
  };
}

// ============================================================================
// EMBEDDINGS MISTRAL
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: [text.substring(0, 8000)], // Limite pour éviter les erreurs
    }),
  });

  if (response.status === 429) {
    console.log(`      ⚠️  Rate limit Mistral, pause de ${RETRY_DELAY / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    return generateEmbedding(text); // Retry
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur Mistral API: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function generateEmbeddingsForBatch(records: CaseLawRecord[]): Promise<void> {
  console.log(`\n   🧠 Génération des embeddings (${records.length} décisions)...`);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    try {
      // Texte enrichi pour l'embedding
      const textForEmbedding = `${record.title}\n\nRésumé: ${record.summary || 'N/A'}\n\n${record.full_text.substring(0, 6000)}`;

      const embedding = await generateEmbedding(textForEmbedding);

      // Update dans Supabase
      const { error } = await supabase
        .from('case_law')
        .update({ embedding })
        .eq('source_id', record.source_id)
        .eq('source_api', 'judilibre');

      if (error) {
        console.error(`      ❌ Erreur update embedding:`, error.message);
        continue;
      }

      if ((i + 1) % 10 === 0) {
        console.log(`      ⏳ ${i + 1}/${records.length} embeddings générés...`);
      }

      // Petit délai pour éviter le rate limit
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error: any) {
      console.error(`      ❌ Erreur embedding pour ${record.title}:`, error.message);
    }
  }

  console.log(`   ✅ ${records.length} embeddings traités`);
}

// ============================================================================
// IMPORT DANS SUPABASE
// ============================================================================

async function importDecisions(
  decisions: JudilibreDecision[],
  jurisdictionId: string
): Promise<{ imported: number; skipped: number }> {
  console.log(`\n💾 Insertion de ${decisions.length} décisions...`);

  let imported = 0;
  let skipped = 0;

  const batches = Math.ceil(decisions.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, decisions.length);
    const batch = decisions.slice(start, end);

    // Transformer les décisions
    const records = await Promise.all(
      batch.map(d => transformDecision(d, jurisdictionId))
    );

    // UPSERT avec conflit sur (source_id, source_api)
    const { data, error } = await supabase
      .from('case_law')
      .upsert(records, {
        onConflict: 'source_id,source_api',
        ignoreDuplicates: false,
      })
      .select('id');

    if (error) {
      console.error(`   ❌ Erreur batch ${i + 1}/${batches}:`, error.message);
      skipped += batch.length;
      continue;
    }

    imported += data?.length || 0;
    console.log(`   ✅ Batch ${i + 1}/${batches} - ${data?.length || 0} décisions`);

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`   ✅ Import terminé: ${imported} insérées, ${skipped} ignorées`);

  return { imported, skipped };
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

async function main() {
  console.log('🚀 IMPORT JURISPRUDENCE JUDILIBRE (COUR DE CASSATION)\n');
  console.log('='.repeat(70));

  // Parse arguments
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const maxDecisions = limitArg ? parseInt(limitArg.split('=')[1]) : 100;

  console.log(`\n🎯 Objectif: ${maxDecisions} décisions (test)`);
  console.log(`📅 Période: 2020-2025`);
  console.log(`⚖️  Juridiction: Cour de Cassation`);

  const stats: ImportStats = {
    total: 0,
    imported: 0,
    skipped: 0,
    withEmbeddings: 0,
    errors: 0,
  };

  try {
    // Vérifier les variables d'environnement
    const requiredVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'MISTRAL_API_KEY',
      'LEGIFRANCE_CLIENT_ID',
      'LEGIFRANCE_CLIENT_SECRET',
    ];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Variable manquante: ${varName}`);
      }
    }

    console.log('\n✅ Variables d\'environnement OK');

    // Obtenir le token PISTE
    const token = await getPisteToken();

    // Obtenir/créer la juridiction Cour de Cassation
    console.log('\n🏛️  Récupération de la juridiction...');
    const jurisdictionId = await getOrCreateJurisdiction('Cour de Cassation');
    console.log(`   ✅ Juridiction ID: ${jurisdictionId}`);

    // Récupérer les décisions par batch
    let currentBatch = 0;
    let decisionsCollected: JudilibreDecision[] = [];

    while (decisionsCollected.length < maxDecisions) {
      try {
        const response = await searchJudilibre(token, currentBatch);

        if (!response.results || response.results.length === 0) {
          console.log('   ℹ️  Plus de décisions disponibles');
          break;
        }

        decisionsCollected.push(...response.results);
        stats.total += response.results.length;

        console.log(`   📊 Total collecté: ${decisionsCollected.length}/${maxDecisions}`);

        if (decisionsCollected.length >= maxDecisions) {
          decisionsCollected = decisionsCollected.slice(0, maxDecisions);
          break;
        }

        currentBatch++;

        // Pause entre les requêtes API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.error(`   ❌ Erreur batch ${currentBatch}:`, error.message);
        stats.errors++;
        break;
      }
    }

    console.log(`\n📚 ${decisionsCollected.length} décisions collectées`);

    if (decisionsCollected.length === 0) {
      console.log('\n⚠️  Aucune décision à importer');
      return;
    }

    // Importer dans Supabase
    const { imported, skipped } = await importDecisions(decisionsCollected, jurisdictionId);
    stats.imported = imported;
    stats.skipped = skipped;

    // Générer les embeddings
    if (imported > 0) {
      // Récupérer les décisions insérées (sans embeddings)
      const { data: insertedDecisions } = await supabase
        .from('case_law')
        .select('source_id, title, summary, full_text')
        .eq('source_api', 'judilibre')
        .is('embedding', null)
        .limit(imported);

      if (insertedDecisions && insertedDecisions.length > 0) {
        const records = insertedDecisions.map(d => ({
          source_id: d.source_id,
          title: d.title,
          summary: d.summary,
          full_text: d.full_text,
          jurisdiction_id: jurisdictionId,
          decision_date: '',
          source_api: 'judilibre',
        }));

        await generateEmbeddingsForBatch(records);
        stats.withEmbeddings = insertedDecisions.length;
      }
    }

    // Résumé final
    console.log('\n' + '='.repeat(70));
    console.log('🎉 IMPORT TERMINÉ');
    console.log('='.repeat(70));
    console.log(`\n📊 STATISTIQUES:`);
    console.log(`   • Décisions collectées : ${stats.total}`);
    console.log(`   • Décisions importées  : ${stats.imported}`);
    console.log(`   • Décisions ignorées   : ${stats.skipped}`);
    console.log(`   • Embeddings générés   : ${stats.withEmbeddings}`);
    console.log(`   • Erreurs              : ${stats.errors}`);

    console.log('\n💡 Vérifier la progression:');
    console.log('   npx tsx scripts/check-judilibre-progress.ts\n');

  } catch (error: any) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
