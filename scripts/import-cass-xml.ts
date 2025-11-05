/**
 * Import jurisprudence depuis CASS XML (DILA)
 *
 * Usage:
 *   npx tsx scripts/import-cass-xml.ts --download --limit=1000
 *   npx tsx scripts/import-cass-xml.ts --limit=5000  # Use cached file
 *
 * Source: https://echanges.dila.gouv.fr/OPENDATA/CASS/
 * Format: XML (TEXTE_JURI_JUDI)
 * Full dataset: Freemium_cass_global_*.tar.gz (~248 MB, ~500k decisions)
 */

import { createClient } from '@supabase/supabase-js';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { createWriteStream } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import dotenv from 'dotenv';
import * as tar from 'tar';
import { XMLParser } from 'fast-xml-parser';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CASS_BASE_URL = 'https://echanges.dila.gouv.fr/OPENDATA/CASS/';
const FULL_DATASET = 'Freemium_cass_global_20250713-140000.tar.gz';
const DOWNLOAD_PATH = resolve(process.cwd(), 'data', 'cass-full.tar.gz');
const EXTRACT_PATH = resolve(process.cwd(), 'data', 'cass-extracted');
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

interface CassDecision {
  id: string;
  titre: string;
  date_dec: string;
  juridiction: string;
  solution?: string;
  formation?: string;
  numero_affaire?: string;
  contenu: string;
  sommaire?: string;
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
// TÉLÉCHARGEMENT
// ============================================================================

async function downloadDataset(forceDownload: boolean = false): Promise<string> {
  if (existsSync(DOWNLOAD_PATH) && !forceDownload) {
    console.log(`   ✅ Fichier déjà présent (cache): ${DOWNLOAD_PATH}`);
    const stats = await import('fs').then(fs => fs.statSync(DOWNLOAD_PATH));
    console.log(`   📦 Taille: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    return DOWNLOAD_PATH;
  }

  console.log(`📥 Téléchargement du dataset complet...`);
  console.log(`   URL: ${CASS_BASE_URL}${FULL_DATASET}`);
  console.log(`   ⚠️  Taille: ~248 MB, cela peut prendre plusieurs minutes...\n`);

  const response = await fetch(`${CASS_BASE_URL}${FULL_DATASET}`);

  if (!response.ok) {
    throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0');
  let downloadedBytes = 0;

  const fileStream = createWriteStream(DOWNLOAD_PATH);
  const reader = response.body!.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    fileStream.write(value);
    downloadedBytes += value.length;

    const percentage = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
    const downloaded = (downloadedBytes / 1024 / 1024).toFixed(1);
    const total = (totalBytes / 1024 / 1024).toFixed(1);

    process.stdout.write(`\r   ⏳ Téléchargement: ${downloaded}/${total} MB (${percentage.toFixed(1)}%)`);
  }

  fileStream.end();
  console.log(`\n   ✅ Téléchargement terminé\n`);

  return DOWNLOAD_PATH;
}

// ============================================================================
// PARSING XML
// ============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
});

function cleanHtml(text: any): string {
  if (!text) return '';

  // Handle arrays or objects by converting to string
  let textStr: string;
  if (typeof text === 'string') {
    textStr = text;
  } else if (typeof text === 'object') {
    // Extract text from object or array
    if (text['#text']) {
      textStr = text['#text'];
    } else if (Array.isArray(text)) {
      textStr = text.map(item =>
        typeof item === 'string' ? item : item['#text'] || JSON.stringify(item)
      ).join(' ');
    } else {
      textStr = JSON.stringify(text);
    }
  } else {
    textStr = String(text);
  }

  return textStr
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parseXmlFile(xmlPath: string): Promise<CassDecision | null> {
  try {
    const xmlContent = readFileSync(xmlPath, 'utf-8');
    const parsed = xmlParser.parse(xmlContent);

    const root = parsed.TEXTE_JURI_JUDI;
    if (!root || !root.META || !root.TEXTE) {
      return null;
    }

    const meta = root.META.META_SPEC?.META_JURI;
    const metaJudi = root.META.META_SPEC?.META_JURI_JUDI;
    const texte = root.TEXTE.BLOC_TEXTUEL?.CONTENU;
    const sommaire = root.TEXTE.SOMMAIRE?.ANA;

    if (!meta || !texte) {
      return null;
    }

    const decision: CassDecision = {
      id: root.META.META_COMMUN.ID,
      titre: meta.TITRE || '',
      date_dec: meta.DATE_DEC || '',
      juridiction: meta.JURIDICTION || 'Cour de cassation',
      solution: meta.SOLUTION || null,
      formation: metaJudi?.FORMATION || null,
      numero_affaire: metaJudi?.NUMEROS_AFFAIRES?.NUMERO_AFFAIRE || null,
      contenu: cleanHtml(texte),
      sommaire: sommaire ? cleanHtml(sommaire) : null,
    };

    return decision;

  } catch (error: any) {
    console.error(`      ❌ Erreur parsing ${xmlPath}: ${error.message}`);
    return null;
  }
}

// ============================================================================
// EXTRACTION ET PARSING
// ============================================================================

async function extractAndParseDecisions(
  tarPath: string,
  limit?: number
): Promise<CassDecision[]> {
  console.log(`📖 Extraction et parsing des décisions...`);
  console.log(`   Fichier: ${tarPath}`);
  console.log(`   Limite: ${limit ? limit.toLocaleString() : 'Toutes'}\n`);

  const decisions: CassDecision[] = [];
  let processed = 0;
  let errors = 0;

  // Extract tar.gz to temporary directory
  console.log(`   📦 Extraction de l'archive...`);
  await tar.extract({
    file: tarPath,
    cwd: resolve(process.cwd(), 'data'),
  });

  // Find all XML files
  const { execSync } = await import('child_process');
  const findCommand = `find "${EXTRACT_PATH}" -name "*.xml" -type f 2>/dev/null || find "$(dirname ${EXTRACT_PATH})" -name "*.xml" -type f 2>/dev/null`;

  let xmlFiles: string[];
  try {
    const output = execSync(findCommand, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    xmlFiles = output.trim().split('\n').filter(f => f && f.endsWith('.xml'));
  } catch (error) {
    console.error(`   ❌ Erreur lors de la recherche des fichiers XML`);
    throw error;
  }

  console.log(`   ✅ ${xmlFiles.length.toLocaleString()} fichiers XML trouvés`);
  console.log(`   ⏳ Parsing en cours...\n`);

  // Parse XML files
  for (const xmlPath of xmlFiles) {
    if (limit && decisions.length >= limit) {
      break;
    }

    const decision = await parseXmlFile(xmlPath);

    if (decision && decision.date_dec && decision.contenu) {
      // Filter: prioritize 2020-2025
      const year = new Date(decision.date_dec).getFullYear();
      if (year >= 2020 && year <= 2025) {
        decisions.push(decision);
      } else if (!limit || decisions.length < limit / 2) {
        // Include older decisions if we have space
        decisions.push(decision);
      }
    } else {
      errors++;
    }

    processed++;

    if (processed % 1000 === 0) {
      process.stdout.write(`\r   ⏳ Parsé: ${processed.toLocaleString()} | Valides: ${decisions.length.toLocaleString()} | Erreurs: ${errors}`);
    }
  }

  console.log(`\n\n   ✅ Parsing terminé`);
  console.log(`   📊 Total parsé: ${processed.toLocaleString()}`);
  console.log(`   ✨ Décisions valides: ${decisions.length.toLocaleString()}`);
  console.log(`   ❌ Erreurs: ${errors}\n`);

  // Sort by date (newest first)
  decisions.sort((a, b) => new Date(b.date_dec).getTime() - new Date(a.date_dec).getTime());

  return limit ? decisions.slice(0, limit) : decisions;
}

// ============================================================================
// JURIDICTIONS
// ============================================================================

async function getOrCreateJurisdiction(name: string): Promise<string> {
  const { data: existing } = await supabase
    .from('jurisdictions')
    .select('id')
    .eq('name', name)
    .single();

  if (existing) {
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('jurisdictions')
    .insert([{ name }])
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`Impossible de créer la juridiction ${name}: ${error?.message}`);
  }

  console.log(`   ✅ Juridiction créée: ${name}`);
  return created.id;
}

// ============================================================================
// TRANSFORMATION
// ============================================================================

async function transformDecision(
  decision: CassDecision,
  jurisdictionId: string
): Promise<CaseLawRecord> {
  return {
    jurisdiction_id: jurisdictionId,
    title: decision.titre,
    decision_date: decision.date_dec,
    summary: decision.sommaire || null,
    full_text: decision.contenu,
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
        console.log(`      ⚠️  Rate limit Mistral, pause de ${RETRY_DELAY / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Mistral API: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.data[0].embedding;

    } catch (error: any) {
      if (attempt === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw new Error('Failed after retries');
}

async function generateEmbeddingsForBatch(records: CaseLawRecord[]): Promise<void> {
  console.log(`\n   🧠 Génération des embeddings (${records.length} décisions)...`);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    try {
      const textForEmbedding = `${record.title}\n\nRésumé: ${record.summary || 'N/A'}\n\n${record.full_text.substring(0, 6000)}`;
      const embedding = await generateEmbedding(textForEmbedding);

      const { error } = await supabase
        .from('case_law')
        .update({ embedding })
        .eq('title', record.title)
        .eq('decision_date', record.decision_date);

      if (error) {
        console.error(`      ❌ Erreur update embedding: ${error.message}`);
        continue;
      }

      if ((i + 1) % 10 === 0) {
        console.log(`      ⏳ ${i + 1}/${records.length} embeddings générés...`);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error: any) {
      console.error(`      ❌ Erreur embedding pour ${record.title}: ${error.message}`);
    }
  }

  console.log(`   ✅ ${records.length} embeddings traités`);
}

// ============================================================================
// IMPORT DANS SUPABASE
// ============================================================================

async function importDecisions(
  decisions: CassDecision[],
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

    const records = await Promise.all(
      batch.map(d => transformDecision(d, jurisdictionId))
    );

    const { data, error } = await supabase
      .from('case_law')
      .insert(records)
      .select('id');

    if (error) {
      console.error(`   ❌ Erreur batch ${i + 1}/${batches}: ${error.message}`);
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
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 IMPORT JURISPRUDENCE CASS XML (DILA)\n');
  console.log('='.repeat(70));

  // Parse arguments
  const args = process.argv.slice(2);
  const forceDownload = args.includes('--download');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const maxDecisions = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

  console.log(`\n🎯 Objectif: ${maxDecisions.toLocaleString()} décisions`);
  console.log(`📅 Priorité: 2020-2025 (plus récentes)`);
  console.log(`⚖️  Source: DILA CASS XML (~500k décisions)`);
  console.log(`📥 Téléchargement: ${forceDownload ? 'OUI (forcé)' : 'Cache si disponible'}\n`);

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

    console.log('✅ Variables d\'environnement OK\n');

    // Télécharger le dataset
    const datasetPath = await downloadDataset(forceDownload);

    // Extraire et parser
    const decisions = await extractAndParseDecisions(datasetPath, maxDecisions);
    stats.total = decisions.length;

    if (decisions.length === 0) {
      console.log('\n⚠️  Aucune décision à importer');
      return;
    }

    // Obtenir la juridiction
    console.log('🏛️  Récupération de la juridiction...');
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
        .select('title, summary, full_text, decision_date')
        .eq('jurisdiction_id', jurisdictionId)
        .is('embedding', null)
        .limit(imported);

      if (insertedDecisions && insertedDecisions.length > 0) {
        const records = insertedDecisions.map(d => ({
          jurisdiction_id: jurisdictionId,
          title: d.title,
          summary: d.summary,
          full_text: d.full_text,
          decision_date: d.decision_date,
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
