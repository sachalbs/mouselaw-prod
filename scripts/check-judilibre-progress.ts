/**
 * Vérification de la progression d'import Judilibre
 *
 * Usage:
 *   npx tsx scripts/check-judilibre-progress.ts
 *
 * Affiche:
 * - Nombre total de décisions
 * - Répartition par juridiction
 * - Répartition par année
 * - Progression des embeddings
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// STATISTIQUES GLOBALES
// ============================================================================

async function getGlobalStats() {
  console.log('📊 Récupération des statistiques globales...\n');

  // Total de décisions
  const { count: total } = await supabase
    .from('case_law')
    .select('*', { count: 'exact', head: true });

  // Décisions avec embeddings
  const { count: withEmbeddings } = await supabase
    .from('case_law')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  // Décisions Judilibre
  const { count: judilibre } = await supabase
    .from('case_law')
    .select('*', { count: 'exact', head: true })
    .eq('source_api', 'judilibre');

  const percentage = total && total > 0 ? (withEmbeddings! / total) * 100 : 0;

  console.log('='.repeat(70));
  console.log('📈 STATISTIQUES GLOBALES');
  console.log('='.repeat(70));
  console.log(`\n📚 Total de décisions      : ${total?.toLocaleString() || 0}`);
  console.log(`🔍 Depuis Judilibre        : ${judilibre?.toLocaleString() || 0}`);
  console.log(`✅ Avec embeddings         : ${withEmbeddings?.toLocaleString() || 0}`);
  console.log(`❌ Sans embeddings         : ${((total || 0) - (withEmbeddings || 0)).toLocaleString()}`);
  console.log(`📊 Progression             : ${percentage.toFixed(1)}%`);

  // Barre de progression
  const barLength = 50;
  const filledLength = Math.round((percentage / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  console.log(`\n[${bar}] ${percentage.toFixed(1)}%\n`);

  return { total: total || 0, withEmbeddings: withEmbeddings || 0, judilibre: judilibre || 0 };
}

// ============================================================================
// PAR JURIDICTION
// ============================================================================

async function getStatsByJurisdiction() {
  console.log('='.repeat(70));
  console.log('🏛️  RÉPARTITION PAR JURIDICTION');
  console.log('='.repeat(70));

  const { data: stats, error } = await supabase
    .from('case_law')
    .select(`
      jurisdiction_id,
      jurisdictions (
        name
      )
    `);

  if (error) {
    console.error('❌ Erreur:', error.message);
    return;
  }

  // Compter par juridiction
  const jurisdictionCounts: Record<string, number> = {};

  stats?.forEach((row: any) => {
    const jurisdictionName = row.jurisdictions?.name || 'Inconnue';
    jurisdictionCounts[jurisdictionName] = (jurisdictionCounts[jurisdictionName] || 0) + 1;
  });

  // Trier par nombre décroissant
  const sorted = Object.entries(jurisdictionCounts).sort((a, b) => b[1] - a[1]);

  console.log('');
  sorted.forEach(([jurisdiction, count]) => {
    const bar = '█'.repeat(Math.min(50, Math.round(count / 10)));
    console.log(`   ${jurisdiction.padEnd(30)} : ${count.toString().padStart(5)} ${bar}`);
  });

  console.log('');
}

// ============================================================================
// PAR ANNÉE
// ============================================================================

async function getStatsByYear() {
  console.log('='.repeat(70));
  console.log('📅 RÉPARTITION PAR ANNÉE');
  console.log('='.repeat(70));

  const { data: decisions, error } = await supabase
    .from('case_law')
    .select('decision_date')
    .not('decision_date', 'is', null)
    .order('decision_date', { ascending: false });

  if (error) {
    console.error('❌ Erreur:', error.message);
    return;
  }

  // Compter par année
  const yearCounts: Record<string, number> = {};

  decisions?.forEach((row: any) => {
    if (row.decision_date) {
      const year = new Date(row.decision_date).getFullYear().toString();
      if (!isNaN(parseInt(year))) {
        yearCounts[year] = (yearCounts[year] || 0) + 1;
      }
    }
  });

  // Trier par année décroissante
  const sorted = Object.entries(yearCounts).sort((a, b) => b[0].localeCompare(a[0]));

  console.log('');
  sorted.forEach(([year, count]) => {
    const bar = '█'.repeat(Math.min(50, Math.round(count / 20)));
    console.log(`   ${year} : ${count.toString().padStart(5)} ${bar}`);
  });

  console.log('');
}

// ============================================================================
// SOURCES API
// ============================================================================

async function getStatsBySources() {
  console.log('='.repeat(70));
  console.log('🔗 RÉPARTITION PAR SOURCE API');
  console.log('='.repeat(70));

  const { data: stats, error } = await supabase
    .from('case_law')
    .select('source_api');

  if (error) {
    console.error('❌ Erreur:', error.message);
    return;
  }

  // Compter par source
  const sourceCounts: Record<string, number> = {};

  stats?.forEach((row: any) => {
    const source = row.source_api || 'inconnue';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  // Trier par nombre décroissant
  const sorted = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);

  console.log('');
  sorted.forEach(([source, count]) => {
    const bar = '█'.repeat(Math.min(50, Math.round(count / 50)));
    console.log(`   ${source.padEnd(20)} : ${count.toString().padStart(5)} ${bar}`);
  });

  console.log('');
}

// ============================================================================
// DÉCISIONS RÉCENTES
// ============================================================================

async function getRecentDecisions(limit: number = 10) {
  console.log('='.repeat(70));
  console.log(`📰 ${limit} DÉCISIONS LES PLUS RÉCENTES`);
  console.log('='.repeat(70));

  const { data: decisions, error } = await supabase
    .from('case_law')
    .select(`
      title,
      decision_date,
      summary,
      embedding,
      jurisdictions (
        name
      )
    `)
    .order('decision_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('❌ Erreur:', error.message);
    return;
  }

  console.log('');
  decisions?.forEach((decision: any, index: number) => {
    const date = new Date(decision.decision_date).toLocaleDateString('fr-FR');
    const jurisdiction = decision.jurisdictions?.name || 'N/A';
    const hasEmbedding = decision.embedding ? '✅' : '❌';
    const summaryPreview = decision.summary
      ? decision.summary.substring(0, 80) + '...'
      : 'Pas de résumé';

    console.log(`${index + 1}. ${hasEmbedding} ${decision.title}`);
    console.log(`   📅 ${date} | 🏛️  ${jurisdiction}`);
    console.log(`   📝 ${summaryPreview}`);
    console.log('');
  });
}

// ============================================================================
// RECOMMANDATIONS
// ============================================================================

function displayRecommendations(stats: {
  total: number;
  withEmbeddings: number;
  judilibre: number;
}) {
  console.log('='.repeat(70));
  console.log('💡 RECOMMANDATIONS');
  console.log('='.repeat(70));
  console.log('');

  if (stats.total === 0) {
    console.log('⚠️  Aucune décision en base de données.');
    console.log('   → Lancez l\'import : npx tsx scripts/import-judilibre.ts --limit=100');
  } else if (stats.judilibre === 0) {
    console.log('⚠️  Aucune décision Judilibre importée.');
    console.log('   → Lancez l\'import : npx tsx scripts/import-judilibre.ts --limit=100');
  } else if (stats.withEmbeddings < stats.total) {
    const missing = stats.total - stats.withEmbeddings;
    console.log(`⚠️  ${missing} décision(s) sans embeddings.`);
    console.log('   → Relancez l\'import pour compléter les embeddings');
  } else {
    console.log('✅ Toutes les décisions ont des embeddings !');
  }

  console.log('');
  console.log('📈 Pour importer plus de décisions:');
  console.log('   npx tsx scripts/import-judilibre.ts --limit=1000');
  console.log('   npx tsx scripts/import-judilibre.ts --limit=10000');
  console.log('');
  console.log('🧪 Pour tester le système RAG:');
  console.log('   npx tsx scripts/test-new-rag.ts');
  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🔍 VÉRIFICATION PROGRESSION JUDILIBRE\n');

  try {
    const stats = await getGlobalStats();
    await getStatsByJurisdiction();
    await getStatsByYear();
    await getStatsBySources();
    await getRecentDecisions(10);
    displayRecommendations(stats);

    console.log('='.repeat(70));
    console.log('✅ Vérification terminée\n');

  } catch (error: any) {
    console.error('\n❌ ERREUR:', error.message);
    process.exit(1);
  }
}

main();
