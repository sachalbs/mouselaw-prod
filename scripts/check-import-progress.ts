/**
 * Script de vérification de la progression d'import des codes juridiques
 *
 * Usage:
 *   npx tsx scripts/check-import-progress.ts
 *
 * Affiche :
 * - Nombre total d'articles importés
 * - Répartition par code
 * - Pourcentage d'articles avec embeddings par code
 * - Liste des articles sans embeddings (si demandé)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Charger explicitement .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TYPES
// ============================================================================

interface LegalCode {
  id: string;
  code_name: string;
  display_name: string;
  legifrance_id: string;
}

interface CodeStats {
  code: LegalCode;
  totalArticles: number;
  withEmbeddings: number;
  withoutEmbeddings: number;
  percentage: number;
}

// ============================================================================
// FONCTIONS DE STATISTIQUES
// ============================================================================

/**
 * Récupère tous les codes juridiques
 */
async function fetchLegalCodes(): Promise<LegalCode[]> {
  const { data, error } = await supabase
    .from('legal_codes')
    .select('id, code_name, display_name, legifrance_id')
    .order('code_name');

  if (error) {
    throw new Error(`Erreur récupération codes: ${error.message}`);
  }

  return data || [];
}

/**
 * Compte les articles pour un code donné
 */
async function getCodeStatistics(codeId: string): Promise<{
  total: number;
  withEmbeddings: number;
}> {
  // Total d'articles
  const { count: total } = await supabase
    .from('legal_articles')
    .select('*', { count: 'exact', head: true })
    .eq('code_id', codeId);

  // Articles avec embeddings
  const { count: withEmbeddings } = await supabase
    .from('legal_articles')
    .select('*', { count: 'exact', head: true })
    .eq('code_id', codeId)
    .not('embedding', 'is', null);

  return {
    total: total || 0,
    withEmbeddings: withEmbeddings || 0,
  };
}

/**
 * Récupère les articles sans embeddings pour un code
 */
async function getArticlesWithoutEmbeddings(
  codeId: string,
  limit: number = 50
): Promise<Array<{ article_number: string; title: string | null }>> {
  const { data, error } = await supabase
    .from('legal_articles')
    .select('article_number, title')
    .eq('code_id', codeId)
    .is('embedding', null)
    .order('article_number')
    .limit(limit);

  if (error) {
    console.error(`Erreur récupération articles sans embeddings:`, error.message);
    return [];
  }

  return data || [];
}

/**
 * Affiche les statistiques globales
 */
async function displayGlobalStatistics(stats: CodeStats[]): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('📊 STATISTIQUES GLOBALES');
  console.log('='.repeat(70));

  const totalArticles = stats.reduce((sum, s) => sum + s.totalArticles, 0);
  const totalWithEmbeddings = stats.reduce((sum, s) => sum + s.withEmbeddings, 0);
  const totalWithoutEmbeddings = stats.reduce((sum, s) => sum + s.withoutEmbeddings, 0);
  const globalPercentage = totalArticles > 0 ? (totalWithEmbeddings / totalArticles) * 100 : 0;

  console.log(`\n📚 Total d'articles : ${totalArticles.toLocaleString()}`);
  console.log(`✅ Avec embeddings : ${totalWithEmbeddings.toLocaleString()}`);
  console.log(`❌ Sans embeddings : ${totalWithoutEmbeddings.toLocaleString()}`);
  console.log(`📈 Progression globale : ${globalPercentage.toFixed(2)}%`);

  // Barre de progression
  const barLength = 50;
  const filledLength = Math.round((globalPercentage / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  console.log(`\n[${bar}] ${globalPercentage.toFixed(1)}%`);
}

/**
 * Affiche les statistiques par code
 */
function displayCodeStatistics(stats: CodeStats[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('📖 STATISTIQUES PAR CODE JURIDIQUE');
  console.log('='.repeat(70));

  // Trier par pourcentage de complétion (décroissant)
  const sortedStats = [...stats].sort((a, b) => b.percentage - a.percentage);

  for (const stat of sortedStats) {
    console.log(`\n${getStatusEmoji(stat.percentage)} ${stat.code.code_name.toUpperCase()}`);
    console.log(`   ${stat.code.display_name}`);
    console.log(`   ${'─'.repeat(60)}`);
    console.log(`   Total d'articles      : ${stat.totalArticles.toLocaleString()}`);
    console.log(`   ✅ Avec embeddings    : ${stat.withEmbeddings.toLocaleString()}`);
    console.log(`   ❌ Sans embeddings    : ${stat.withoutEmbeddings.toLocaleString()}`);

    // Barre de progression individuelle
    const barLength = 30;
    const filledLength = Math.round((stat.percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    console.log(`   Progression           : [${bar}] ${stat.percentage.toFixed(1)}%`);
  }
}

/**
 * Affiche les articles sans embeddings pour les codes incomplets
 */
async function displayMissingEmbeddings(stats: CodeStats[]): Promise<void> {
  const incompleteCodes = stats.filter(s => s.withoutEmbeddings > 0);

  if (incompleteCodes.length === 0) {
    console.log('\n✅ Tous les codes ont des embeddings complets !');
    return;
  }

  console.log('\n' + '='.repeat(70));
  console.log('⚠️  ARTICLES SANS EMBEDDINGS (échantillon)');
  console.log('='.repeat(70));

  for (const stat of incompleteCodes) {
    if (stat.withoutEmbeddings > 0) {
      console.log(`\n📖 ${stat.code.code_name} (${stat.withoutEmbeddings} articles sans embeddings)`);

      const missingArticles = await getArticlesWithoutEmbeddings(stat.code.id, 10);

      if (missingArticles.length > 0) {
        for (const article of missingArticles) {
          const title = article.title ? ` - ${article.title}` : '';
          console.log(`   • Article ${article.article_number}${title}`);
        }

        if (stat.withoutEmbeddings > missingArticles.length) {
          console.log(`   ... et ${stat.withoutEmbeddings - missingArticles.length} autres`);
        }
      }
    }
  }
}

/**
 * Retourne un emoji selon le pourcentage de complétion
 */
function getStatusEmoji(percentage: number): string {
  if (percentage === 100) return '🟢';
  if (percentage >= 75) return '🟡';
  if (percentage >= 50) return '🟠';
  if (percentage >= 25) return '🔴';
  return '⚫';
}

/**
 * Affiche des recommandations basées sur les statistiques
 */
function displayRecommendations(stats: CodeStats[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('💡 RECOMMANDATIONS');
  console.log('='.repeat(70));

  const incompleteCodes = stats.filter(s => s.percentage < 100);
  const emptyEmbeddings = stats.filter(s => s.withEmbeddings === 0 && s.totalArticles > 0);

  if (stats.length === 0 || stats.every(s => s.totalArticles === 0)) {
    console.log('\n⚠️  Aucun article trouvé en base de données.');
    console.log('   → Lancez l\'import : npx tsx scripts/import-all-codes.ts');
  } else if (emptyEmbeddings.length > 0) {
    console.log('\n⚠️  Certains codes ont des articles mais aucun embedding.');
    console.log('   → Relancez l\'import : npx tsx scripts/import-all-codes.ts');
  } else if (incompleteCodes.length > 0) {
    console.log(`\n⚠️  ${incompleteCodes.length} code(s) avec embeddings incomplets :`);
    incompleteCodes.forEach(s => {
      console.log(`   • ${s.code.code_name} : ${s.percentage.toFixed(1)}% (${s.withoutEmbeddings} manquants)`);
    });
    console.log('   → Relancez l\'import pour compléter : npx tsx scripts/import-all-codes.ts');
  } else {
    console.log('\n✅ Tous les codes sont complets avec embeddings !');
    console.log('   → Votre base de données RAG est prête à être utilisée.');
  }

  console.log('\n📚 Pour tester le système RAG :');
  console.log('   npx tsx scripts/test-new-rag.ts');
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

async function main() {
  console.log('🔍 VÉRIFICATION DE LA PROGRESSION D\'IMPORT\n');

  try {
    // Vérifier les variables d'environnement
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Variables d\'environnement Supabase manquantes');
    }

    // Récupérer les codes
    console.log('📚 Récupération des codes juridiques...');
    const codes = await fetchLegalCodes();

    if (codes.length === 0) {
      console.log('⚠️  Aucun code trouvé dans la table legal_codes.');
      console.log('Assurez-vous que les migrations ont été exécutées.');
      return;
    }

    console.log(`✅ ${codes.length} codes trouvés\n`);

    // Collecter les statistiques pour chaque code
    const stats: CodeStats[] = [];

    for (const code of codes) {
      process.stdout.write(`⏳ Analyse de ${code.code_name}...`);

      const { total, withEmbeddings } = await getCodeStatistics(code.id);

      stats.push({
        code,
        totalArticles: total,
        withEmbeddings,
        withoutEmbeddings: total - withEmbeddings,
        percentage: total > 0 ? (withEmbeddings / total) * 100 : 0,
      });

      process.stdout.write(` ✅\n`);
    }

    // Afficher les statistiques
    displayGlobalStatistics(stats);
    displayCodeStatistics(stats);
    await displayMissingEmbeddings(stats);
    displayRecommendations(stats);

    console.log('\n' + '='.repeat(70));
    console.log('✅ Vérification terminée\n');

  } catch (error: any) {
    console.error('\n❌ ERREUR:', error.message);
    process.exit(1);
  }
}

// Exécuter le script
main();
