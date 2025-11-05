#!/usr/bin/env tsx

/**
 * Reset tous les embeddings pour les régénérer avec le contenu enrichi
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + ' (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function resetEmbeddings() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        RESET DES EMBEDDINGS - RÉGÉNÉRATION ENRICHIE      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Check current status
  const { count: total } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true });

  const { count: withEmbeddings } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  console.log('📊 STATUT ACTUEL:');
  console.log(`   Total articles: ${total}`);
  console.log(`   Avec embeddings: ${withEmbeddings}`);
  console.log(`   Sans embeddings: ${total - withEmbeddings}\n`);

  console.log('⚠️  CETTE OPÉRATION VA:');
  console.log('   1. Mettre TOUS les embeddings à NULL');
  console.log('   2. Permettre de régénérer les 3355 embeddings avec le contenu enrichi');
  console.log('   3. Durée estimée: ~45 minutes\n');

  const confirmed = await askConfirmation('⚠️  Êtes-vous sûr de vouloir continuer ?');

  if (!confirmed) {
    console.log('\n❌ Opération annulée\n');
    return;
  }

  console.log('\n🔄 Mise à NULL de tous les embeddings...');

  // Set all embeddings to null
  const { error } = await supabase
    .from('code_civil_articles')
    .update({ embedding: null })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all

  if (error) {
    console.error('❌ Erreur:', error);
    return;
  }

  // Verify
  const { count: afterReset } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  console.log('\n✅ RESET TERMINÉ !');
  console.log(`   Embeddings restants: ${afterReset} (devrait être 0)\n`);

  if (afterReset === 0) {
    console.log('═'.repeat(70));
    console.log('🚀 PROCHAINE ÉTAPE:');
    console.log('═'.repeat(70));
    console.log('\nLancez maintenant:');
    console.log('   npx tsx scripts/import-and-embed.ts\n');
    console.log('Cette commande va régénérer les 3355 embeddings avec le contenu enrichi.');
    console.log('Durée: ~45 minutes (3355 articles, 50 par batch, 2s entre batches)\n');
  }
}

resetEmbeddings().catch(console.error);
