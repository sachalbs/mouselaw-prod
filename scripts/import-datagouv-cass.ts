/**
 * Import de jurisprudence depuis data.gouv.fr (Cour de Cassation)
 *
 * Usage:
 *   npx tsx scripts/import-datagouv-cass.ts [--limit=500]
 *
 * Source: https://www.data.gouv.fr/fr/datasets/cour-de-cassation-judilibre/
 * Table: case_law
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { createWriteStream, existsSync, readFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Dataset complet data.gouv.fr (~500k décisions)
const DATASET_URL = 'https://www.data.gouv.fr/fr/datasets/r/c4b092cd-2bb3-4bd8-8697-f62b2f264268';
const DOWNLOAD_PATH = resolve(process.cwd(), 'data', 'judilibre-full.jsonl');
const SAMPLE_PATH = resolve(process.cwd(), 'data', 'judilibre-sample.json');
const BATCH_SIZE = 50;
const EMBEDDING_DELAY = 2000;
const RETRY_DELAY = 5000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TYPES
// ============================================================================

interface DataGouvDecision {
  _id: string;
  id?: string;
  dateDecision?: string;
  decision_date?: string;
  chambre?: string;
  chamber?: string;
  formation?: string;
  numeroRoleGeneral?: string;
  number?: string;
  texteHtml?: string;
  texte?: string;
  text?: string;
  sommaire?: string;
  summary?: string;
  solution?: string;
  nature?: string;
  matiere?: string;
  publication?: string[];
  [key: string]: any;
}

interface CaseLawRecord {
  jurisdiction_id: string;
  title: string;
  decision_date: string;
  summary: string | null;
  full_text: string;
}

interface ImportStats {
  total: number;
  imported: number;
  skipped: number;
  withEmbeddings: number;
  errors: number;
}

// ============================================================================
// DOWNLOAD
// ============================================================================

async function downloadDataset(forceDownload: boolean = false): Promise<string> {
  console.log('📥 Téléchargement du dataset data.gouv.fr...');
  console.log(`   URL: ${DATASET_URL}`);

  // Créer le dossier data si nécessaire
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true });
  }

  // Utiliser le cache si déjà téléchargé
  if (existsSync(DOWNLOAD_PATH) && !forceDownload) {
    console.log(`   ✅ Fichier déjà présent (cache)`);
    console.log(`   📂 ${DOWNLOAD_PATH}`);
    return DOWNLOAD_PATH;
  }

  try {
    console.log('   ⏳ Téléchargement en cours...');
    const response = await fetch(DATASET_URL);

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength) : 0;
    const totalMB = (totalBytes / 1024 / 1024).toFixed(2);

    console.log(`   📦 Taille: ${totalMB} MB`);

    let downloadedBytes = 0;
    const fileStream = createWriteStream(DOWNLOAD_PATH);

    if (response.body) {
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(value);
        downloadedBytes += value.length;

        if (totalBytes > 0) {
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(2);
          process.stdout.write(`\r   📥 Téléchargement: ${percent}% (${downloadedMB} / ${totalMB} MB)`);
        }
      }

      fileStream.end();
      console.log('\n   ✅ Téléchargement terminé');
      console.log(`   📂 Sauvegardé: ${DOWNLOAD_PATH}`);
    }

    return DOWNLOAD_PATH;

  } catch (error: any) {
    console.error(`\n   ❌ Erreur téléchargement:`, error.message);

    // Fallback sur le sample local si disponible
    if (existsSync(SAMPLE_PATH)) {
      console.log(`   ⚠️  Utilisation du fichier sample local: ${SAMPLE_PATH}`);
      return SAMPLE_PATH;
    }

    throw error;
  }
}

// ============================================================================
// PARSING
// ============================================================================

function cleanHtml(html: string): string {
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

function buildDecisionTitle(decision: DataGouvDecision): string {
  const parts: string[] = [];

  const chamber = decision.chambre || decision.chamber;
  if (chamber) {
    parts.push(chamber);
  }

  const date = decision.dateDecision || decision.decision_date;
  if (date) {
    try {
      const dateObj = new Date(date);
      parts.push(dateObj.toLocaleDateString('fr-FR'));
    } catch {
      parts.push(date);
    }
  }

  const number = decision.numeroRoleGeneral || decision.number;
  if (number) {
    parts.push(`n° ${number}`);
  }

  return parts.join(', ') || `Décision ${decision._id || decision.id}`;
}

function extractDecisionDate(decision: DataGouvDecision): string {
  const date = decision.dateDecision || decision.decision_date;

  if (!date) {
    return new Date().toISOString().split('T')[0];
  }

  try {
    // Gérer différents formats de date
    if (date.match(/^\d{4}-\d{2}-\d{2}/)) {
      return date.split('T')[0];
    }

    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function parseDecisions(filePath: string, limit?: number): DataGouvDecision[] {
  console.log(`\n📖 Parsing du fichier (streaming)...`);

  try {
    const content = readFileSync(filePath, 'utf-8');
    let isJSONLines = false;
    let data: any;

    // Détecter le format
    try {
      // Tenter JSON standard
      data = JSON.parse(content);
      console.log('   Format: JSON standard');
    } catch {
      // JSON Lines (une décision par ligne)
      console.log('   Format: JSON Lines (JSONL)');
      isJSONLines = true;
      const lines = content.split('\n').filter(l => l.trim());

      console.log(`   📄 ${lines.length.toLocaleString()} lignes trouvées`);

      data = [];
      let parsed = 0;
      let errors = 0;

      for (let i = 0; i < lines.length; i++) {
        try {
          const decision = JSON.parse(lines[i]);
          data.push(decision);
          parsed++;

          // Progress tous les 10k
          if (parsed % 10000 === 0) {
            process.stdout.write(`\r   ⏳ Parsing: ${parsed.toLocaleString()} décisions...`);
          }
        } catch {
          errors++;
        }
      }

      console.log(`\n   ✅ ${parsed.toLocaleString()} décisions parsées, ${errors} erreurs`);
    }

    // Normaliser en array
    const decisions = Array.isArray(data) ? data : [data];

    console.log(`   📊 Total: ${decisions.length.toLocaleString()} décisions`);

    // Filtrer les décisions valides (avec texte et date)
    console.log('   🔍 Filtrage des décisions...');
    const filtered = decisions.filter((d: any) => {
      const hasText = d.texteHtml || d.texte || d.text;
      const hasDate = d.dateDecision || d.decision_date || d.date;
      return hasText && hasDate;
    });

    console.log(`   ✅ ${filtered.length.toLocaleString()} décisions valides`);

    // Filtrer par date (priorité 2020-2025)
    const recent = filtered.filter((d: any) => {
      const date = d.dateDecision || d.decision_date || d.date;
      try {
        const year = new Date(date).getFullYear();
        return year >= 2020 && year <= 2025;
      } catch {
        return false;
      }
    });

    console.log(`   🎯 ${recent.length.toLocaleString()} décisions récentes (2020-2025)`);

    // Utiliser les récentes d'abord, sinon toutes
    const toSort = recent.length > 0 ? recent : filtered;

    // Trier par date (plus récentes d'abord)
    const sorted = toSort.sort((a: any, b: any) => {
      const dateA = a.dateDecision || a.decision_date || a.date;
      const dateB = b.dateDecision || b.decision_date || b.date;
      try {
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      } catch {
        return 0;
      }
    });

    // Limiter si demandé
    const result = limit ? sorted.slice(0, limit) : sorted;

    console.log(`   ✨ ${result.length.toLocaleString()} décisions sélectionnées`);

    return result;

  } catch (error: any) {
    console.error(`   ❌ Erreur parsing:`, error.message);
    throw error;
  }
}

// ============================================================================
// TRANSFORMATION
// ============================================================================

async function getOrCreateJurisdiction(name: string): Promise<string> {
  const { data: existing, error: searchError } = await supabase
    .from('jurisdictions')
    .select('id')
    .eq('name', name)
    .single();

  if (existing) {
    return existing.id;
  }

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

async function transformDecision(
  decision: DataGouvDecision,
  jurisdictionId: string
): Promise<CaseLawRecord> {
  const text = decision.texteHtml || decision.texte || decision.text || '';
  const summary = decision.sommaire || decision.summary || text.substring(0, 500);

  return {
    jurisdiction_id: jurisdictionId,
    title: buildDecisionTitle(decision),
    decision_date: extractDecisionDate(decision),
    summary: cleanHtml(summary),
    full_text: cleanHtml(text),
  };
}

// ============================================================================
// EMBEDDINGS
// ============================================================================

async function generateEmbedding(text: string, retries: number = 3): Promise<number[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://api.mistral.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'mistral-embed',
          input: [text.substring(0, 8000)],
        }),
      });

      if (response.status === 429) {
        console.log(`      ⚠️  Rate limit (tentative ${attempt + 1}/${retries}), pause de ${RETRY_DELAY / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Erreur Mistral API: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.data[0].embedding;

    } catch (error: any) {
      if (attempt === retries - 1) throw error;
      console.log(`      ⚠️  Erreur (tentative ${attempt + 1}/${retries}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Max retries atteints');
}

async function generateEmbeddingsForBatch(records: any[]): Promise<void> {
  console.log(`\n   🧠 Génération des embeddings (${records.length} décisions)...`);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    try {
      const textForEmbedding = `${record.title}\n\nRésumé: ${record.summary || 'N/A'}\n\n${record.full_text.substring(0, 6000)}`;

      const embedding = await generateEmbedding(textForEmbedding);

      const { error } = await supabase
        .from('case_law')
        .update({ embedding })
        .eq('id', record.id); // Utiliser l'ID Supabase

      if (error) {
        console.error(`      ❌ Erreur update embedding:`, error.message);
        continue;
      }

      if ((i + 1) % 10 === 0) {
        console.log(`      ⏳ ${i + 1}/${records.length} embeddings générés...`);
      }

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
  decisions: DataGouvDecision[],
  jurisdictionId: string
): Promise<{ imported: number; skipped: number }> {
  console.log(`\n💾 Insertion de ${decisions.length.toLocaleString()} décisions...`);

  let imported = 0;
  let skipped = 0;

  const batches = Math.ceil(decisions.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, decisions.length);
    const batch = decisions.slice(start, end);

    const records = await Promise.all(
      batch.map(d => transformDecision(d, jurisdictionId))
    );

    // INSERT (pas d'UPSERT car pas de clé unique source_id/source_api)
    const { data, error } = await supabase
      .from('case_law')
      .insert(records)
      .select('id');

    if (error) {
      console.error(`   ❌ Erreur batch ${i + 1}/${batches}:`, error.message);
      skipped += batch.length;
      continue;
    }

    imported += data?.length || 0;

    // Progress toutes les 100 décisions
    if (imported % 100 === 0) {
      console.log(`   ⏳ ${imported.toLocaleString()} / ${decisions.length.toLocaleString()} décisions importées...`);
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`   ✅ Import terminé: ${imported.toLocaleString()} insérées, ${skipped} ignorées`);

  return { imported, skipped };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 IMPORT JURISPRUDENCE DATA.GOUV.FR (COUR DE CASSATION)\n');
  console.log('='.repeat(70));

  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const maxDecisions = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;
  const downloadFlag = args.includes('--download');

  console.log(`\n🎯 Objectif: ${maxDecisions.toLocaleString()} décisions`);
  console.log(`📅 Priorité: 2020-2025 (plus récentes)`);
  console.log(`⚖️  Source: data.gouv.fr (~500k décisions)`);
  console.log(`📥 Téléchargement: ${downloadFlag ? 'OUI (forcé)' : 'Cache si disponible'}`);

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
    ];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Variable manquante: ${varName}`);
      }
    }

    console.log('\n✅ Variables d\'environnement OK');

    // Télécharger le dataset
    const filePath = await downloadDataset(downloadFlag);

    // Parser les décisions
    const decisions = parseDecisions(filePath, maxDecisions);
    stats.total = decisions.length;

    if (decisions.length === 0) {
      console.log('\n⚠️  Aucune décision à importer');
      return;
    }

    // Obtenir/créer la juridiction
    console.log('\n🏛️  Récupération de la juridiction...');
    const jurisdictionId = await getOrCreateJurisdiction('Cour de Cassation');
    console.log(`   ✅ Juridiction ID: ${jurisdictionId}`);

    // Importer dans Supabase
    const { imported, skipped } = await importDecisions(decisions, jurisdictionId);
    stats.imported = imported;
    stats.skipped = skipped;

    // Générer les embeddings
    if (imported > 0) {
      const { data: insertedDecisions } = await supabase
        .from('case_law')
        .select('id, title, summary, full_text')
        .eq('jurisdiction_id', jurisdictionId)
        .is('embedding', null)
        .limit(imported);

      if (insertedDecisions && insertedDecisions.length > 0) {
        await generateEmbeddingsForBatch(insertedDecisions);
        stats.withEmbeddings = insertedDecisions.length;
      }
    }

    // Résumé final
    console.log('\n' + '='.repeat(70));
    console.log('🎉 IMPORT TERMINÉ');
    console.log('='.repeat(70));
    console.log(`\n📊 STATISTIQUES:`);
    console.log(`   • Décisions parsées    : ${stats.total}`);
    console.log(`   • Décisions importées  : ${stats.imported}`);
    console.log(`   • Décisions ignorées   : ${stats.skipped}`);
    console.log(`   • Embeddings générés   : ${stats.withEmbeddings}`);

    console.log('\n💡 Vérifier la progression:');
    console.log('   npx tsx scripts/check-judilibre-progress.ts\n');

  } catch (error: any) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
