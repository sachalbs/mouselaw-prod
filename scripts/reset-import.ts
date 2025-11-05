/**
 * Script de réinitialisation de l'import
 *
 * Usage:
 *   npx tsx scripts/reset-import.ts [options]
 *
 * Options:
 *   --embeddings-only    Supprime uniquement les embeddings (garde les articles)
 *   --code=CODE_NAME     Supprime uniquement les articles d'un code spécifique
 *   --confirm            Confirme automatiquement (pas de prompt)
 *
 * Exemples:
 *   npx tsx scripts/reset-import.ts --embeddings-only
 *   npx tsx scripts/reset-import.ts --code="Code Civil"
 *   npx tsx scripts/reset-import.ts --confirm
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import * as readline from 'readline';

// Charger explicitement .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Options {
  embeddingsOnly: boolean;
  codeName?: string;
  confirm: boolean;
}

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Demande une confirmation à l'utilisateur
 */
function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (oui/non): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'oui' || answer.toLowerCase() === 'o');
    });
  });
}

/**
 * Parse les arguments de ligne de commande
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);

  const options: Options = {
    embeddingsOnly: args.includes('--embeddings-only'),
    confirm: args.includes('--confirm'),
  };

  const codeArg = args.find(arg => arg.startsWith('--code='));
  if (codeArg) {
    options.codeName = codeArg.split('=')[1].trim();
  }

  return options;
}

// ============================================================================
// FONCTIONS DE RÉINITIALISATION
// ============================================================================

/**
 * Supprime uniquement les embeddings
 */
async function resetEmbeddings(codeName?: string): Promise<void> {
  console.log('\n🧹 Suppression des embeddings...');

  try {
    let query = supabase.from('legal_articles').update({ embedding: null });

    if (codeName) {
      // Récupérer le code_id
      const { data: code } = await supabase
        .from('legal_codes')
        .select('id')
        .eq('code_name', codeName)
        .single();

      if (!code) {
        console.error(`❌ Code "${codeName}" non trouvé`);
        return;
      }

      query = query.eq('code_id', code.id);
      console.log(`   Ciblant uniquement : ${codeName}`);
    }

    // Compter avant suppression
    const { count: beforeCount } = await supabase
      .from('legal_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    // Supprimer
    const { error } = await query.not('embedding', 'is', null);

    if (error) {
      console.error(`❌ Erreur suppression embeddings:`, error.message);
      return;
    }

    console.log(`✅ ${beforeCount} embeddings supprimés`);
    console.log('   Les articles sont conservés');
  } catch (err: any) {
    console.error(`❌ Erreur:`, err.message);
  }
}

/**
 * Supprime tous les articles d'un code
 */
async function deleteArticlesForCode(codeName: string): Promise<void> {
  console.log(`\n🗑️  Suppression des articles de "${codeName}"...`);

  try {
    // Récupérer le code_id
    const { data: code, error: codeError } = await supabase
      .from('legal_codes')
      .select('id')
      .eq('code_name', codeName)
      .single();

    if (codeError || !code) {
      console.error(`❌ Code "${codeName}" non trouvé:`, codeError?.message);
      return;
    }

    // Compter avant suppression
    const { count } = await supabase
      .from('legal_articles')
      .select('*', { count: 'exact', head: true })
      .eq('code_id', code.id);

    if (count === 0) {
      console.log('   Aucun article à supprimer');
      return;
    }

    // Supprimer
    const { error } = await supabase
      .from('legal_articles')
      .delete()
      .eq('code_id', code.id);

    if (error) {
      console.error(`❌ Erreur suppression articles:`, error.message);
      return;
    }

    console.log(`✅ ${count} articles supprimés pour "${codeName}"`);
  } catch (err: any) {
    console.error(`❌ Erreur:`, err.message);
  }
}

/**
 * Supprime tous les articles de tous les codes
 */
async function deleteAllArticles(): Promise<void> {
  console.log('\n🗑️  Suppression de TOUS les articles...');

  try {
    // Compter avant suppression
    const { count } = await supabase
      .from('legal_articles')
      .select('*', { count: 'exact', head: true });

    if (count === 0) {
      console.log('   Aucun article à supprimer');
      return;
    }

    // Supprimer
    const { error } = await supabase
      .from('legal_articles')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Supprime tout

    if (error) {
      console.error(`❌ Erreur suppression articles:`, error.message);
      return;
    }

    console.log(`✅ ${count} articles supprimés`);
  } catch (err: any) {
    console.error(`❌ Erreur:`, err.message);
  }
}

/**
 * Affiche les statistiques actuelles
 */
async function displayCurrentStats(): Promise<void> {
  console.log('\n📊 Statistiques actuelles :');

  try {
    const { count: totalArticles } = await supabase
      .from('legal_articles')
      .select('*', { count: 'exact', head: true });

    const { count: withEmbeddings } = await supabase
      .from('legal_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`   Articles en base      : ${totalArticles?.toLocaleString() || 0}`);
    console.log(`   Avec embeddings       : ${withEmbeddings?.toLocaleString() || 0}`);
    console.log(`   Sans embeddings       : ${((totalArticles || 0) - (withEmbeddings || 0)).toLocaleString()}`);

    // Stats par code
    const { data: codes } = await supabase
      .from('legal_codes')
      .select('id, code_name')
      .order('code_name');

    if (codes && codes.length > 0) {
      console.log('\n   Par code :');

      for (const code of codes) {
        const { count } = await supabase
          .from('legal_articles')
          .select('*', { count: 'exact', head: true })
          .eq('code_id', code.id);

        if (count && count > 0) {
          console.log(`      • ${code.code_name}: ${count.toLocaleString()} articles`);
        }
      }
    }
  } catch (err: any) {
    console.error(`❌ Erreur récupération stats:`, err.message);
  }
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

async function main() {
  console.log('🔄 RÉINITIALISATION DE L\'IMPORT - MOUSE LAW\n');
  console.log('='.repeat(70));

  try {
    // Vérifier les variables d'environnement
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Variables d\'environnement Supabase manquantes');
      process.exit(1);
    }

    // Parser les arguments
    const options = parseArgs();

    // Afficher les stats actuelles
    await displayCurrentStats();

    // Déterminer l'action
    let actionDescription: string;

    if (options.embeddingsOnly && options.codeName) {
      actionDescription = `Supprimer les embeddings du "${options.codeName}"`;
    } else if (options.embeddingsOnly) {
      actionDescription = 'Supprimer tous les embeddings (conserver les articles)';
    } else if (options.codeName) {
      actionDescription = `Supprimer tous les articles du "${options.codeName}"`;
    } else {
      actionDescription = 'Supprimer TOUS les articles de TOUS les codes';
    }

    console.log('\n⚠️  ACTION À EFFECTUER :');
    console.log(`   ${actionDescription}`);

    // Demander confirmation (sauf si --confirm)
    if (!options.confirm) {
      console.log('\n⚠️  ATTENTION : Cette action est irréversible !');
      const confirmed = await askConfirmation('\nÊtes-vous sûr de vouloir continuer ?');

      if (!confirmed) {
        console.log('\n❌ Opération annulée par l\'utilisateur\n');
        process.exit(0);
      }
    } else {
      console.log('\n✅ Confirmation automatique (--confirm)');
    }

    // Exécuter l'action
    console.log('\n' + '='.repeat(70));

    if (options.embeddingsOnly) {
      await resetEmbeddings(options.codeName);
    } else if (options.codeName) {
      await deleteArticlesForCode(options.codeName);
    } else {
      await deleteAllArticles();
    }

    // Afficher les nouvelles stats
    await displayCurrentStats();

    console.log('\n' + '='.repeat(70));
    console.log('✅ Réinitialisation terminée\n');

    console.log('💡 Pour réimporter :');
    console.log('   npx tsx scripts/import-all-codes.ts\n');

  } catch (error: any) {
    console.error('\n❌ ERREUR:', error.message);
    process.exit(1);
  }
}

// Exécuter
main();
