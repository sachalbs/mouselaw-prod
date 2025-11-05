#!/usr/bin/env tsx

/**
 * Amélioration des embeddings avec contexte enrichi
 *
 * Ce script régénère les embeddings en incluant plus de contexte :
 * - Numéro de l'article
 * - Titre (si disponible)
 * - Catégorie
 * - Contenu
 *
 * Usage:
 *   npx tsx scripts/improve-embeddings.ts                  # Régénérer tous les embeddings
 *   npx tsx scripts/improve-embeddings.ts --sample 10      # Tester sur 10 articles
 *   npx tsx scripts/improve-embeddings.ts --force          # Forcer la régénération même si embeddings existent
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Parse command line arguments
const args = process.argv.slice(2);
const sampleSize = args.includes('--sample') ? parseInt(args[args.indexOf('--sample') + 1]) : null;
const force = args.includes('--force');

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

interface Article {
  id: string;
  article_number: string;
  title: string | null;
  content: string;
  category: string | null;
  embedding: number[] | null;
}

/**
 * Build enriched text for embedding
 */
function buildEnrichedText(article: Article): string {
  const parts: string[] = [];

  // Add article number (always present)
  parts.push(`Article ${article.article_number} du Code civil`);

  // Add category if available
  if (article.category) {
    const categoryMap: Record<string, string> = {
      'responsabilite': 'Responsabilité civile',
      'contrats': 'Droit des contrats',
      'propriete': 'Droit de la propriété',
      'obligations': 'Droit des obligations',
      'vente': 'Vente',
      'general': 'Dispositions générales'
    };
    const categoryLabel = categoryMap[article.category] || article.category;
    parts.push(`Catégorie: ${categoryLabel}`);
  }

  // Add title if available
  if (article.title) {
    parts.push(`Titre: ${article.title}`);
  }

  // Add content
  parts.push('');
  parts.push(article.content);

  return parts.join('. ');
}

/**
 * Generate embeddings in batches
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

      const data = await response.json();

      const batchEmbeddings = data.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => item.embedding);

      results.push(...batchEmbeddings);

      // Update progress
      const progress = Math.round(((i + batch.length) / texts.length) * 100);
      process.stdout.write(
        `\r   Progress: ${progress}% (${i + batch.length}/${texts.length} embeddings)`
      );

      // Rate limit protection
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
 * Main function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Mouse Law - Amélioration des Embeddings avec Contexte  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (sampleSize) {
    console.log(`📝 MODE TEST - Traitement de ${sampleSize} articles seulement\n`);
  }

  if (force) {
    console.log('⚠️  MODE FORCE - Régénération de TOUS les embeddings\n');
  }

  // Fetch articles
  console.log('📖 Récupération des articles...');

  let query = supabase
    .from('code_civil_articles')
    .select('id, article_number, title, content, category, embedding')
    .order('article_number');

  // If not force mode, only get articles without embeddings
  if (!force) {
    query = query.is('embedding', null);
  }

  // If sample mode, limit results
  if (sampleSize) {
    query = query.limit(sampleSize);
  }

  const { data: articles, error } = await query;

  if (error) {
    console.error('❌ Erreur Supabase:', error);
    process.exit(1);
  }

  if (!articles || articles.length === 0) {
    console.log('\n✅ Tous les articles ont déjà des embeddings!\n');
    console.log('💡 Utilisez --force pour régénérer tous les embeddings\n');
    return;
  }

  console.log(`✅ ${articles.length} articles à traiter\n`);

  // Show examples of enriched text
  console.log('📝 Exemples de textes enrichis:\n');
  console.log('─'.repeat(80));

  articles.slice(0, 3).forEach((article: Article, idx: number) => {
    const enrichedText = buildEnrichedText(article);
    console.log(`\n${idx + 1}. Article ${article.article_number}`);
    console.log(`   Ancien format (contenu seul): ${article.content.substring(0, 100)}...`);
    console.log(`   Nouveau format (enrichi): ${enrichedText.substring(0, 150)}...`);
  });

  console.log('\n' + '─'.repeat(80) + '\n');

  // Confirm before proceeding
  if (!sampleSize && articles.length > 100) {
    console.log(`⚠️  Vous allez régénérer ${articles.length} embeddings.`);
    console.log(`   Cela va prendre environ ${Math.ceil(articles.length / 50)} minutes.\n`);
  }

  // Generate enriched texts
  console.log('🔮 Génération des embeddings enrichis...\n');

  const BATCH_SIZE = 50;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, Math.min(i + BATCH_SIZE, articles.length));
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (Articles ${i + 1}-${i + batch.length})`);

    // Build enriched texts
    const enrichedTexts = batch.map(article => buildEnrichedText(article));

    try {
      // Generate embeddings
      console.log('   🔮 Génération des embeddings...');
      const embeddings = await generateBatchEmbeddings(enrichedTexts);

      // Save to database
      console.log('   💾 Sauvegarde dans la base...');
      for (let j = 0; j < batch.length; j++) {
        const { error } = await supabase
          .from('code_civil_articles')
          .update({ embedding: embeddings[j] })
          .eq('id', batch[j].id);

        if (error) {
          console.error(`   ❌ Erreur article ${batch[j].article_number}:`, error.message);
          failed++;
        } else {
          processed++;
        }
      }

      console.log(`   ✅ Batch ${batchNum}/${totalBatches} sauvegardé! (${processed}/${articles.length} total)`);

      // Rate limit protection
      if (i + BATCH_SIZE < articles.length) {
        console.log('   ⏳ Attente 2s avant le prochain batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error: any) {
      console.error(`\n   ❌ Erreur batch ${batchNum}:`, error.message);
      failed += batch.length;
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('                  📊 RÉSULTATS                         ');
  console.log('═'.repeat(80) + '\n');

  console.log(`   • Embeddings générés: ${processed}`);
  console.log(`   • Échecs: ${failed}`);
  console.log(`   • Taux de réussite: ${((processed / (processed + failed)) * 100).toFixed(1)}%`);

  // Get final statistics
  const { count: totalCount } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true });

  const { count: embeddedCount } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  console.log(`\n📊 STATUT DE LA BASE:`);
  console.log(`   • Total articles: ${totalCount || 0}`);
  console.log(`   • Avec embeddings: ${embeddedCount || 0}`);
  console.log(`   • Sans embeddings: ${(totalCount || 0) - (embeddedCount || 0)}`);
  console.log(`   • Prêt pour la recherche: ${(totalCount || 0) - (embeddedCount || 0) === 0 ? 'Oui ✅' : 'Non ❌'}`);

  console.log('\n═'.repeat(80));
  console.log('🎉 Amélioration des embeddings terminée!\n');
  console.log('💡 Prochaine étape: Tester avec scripts/test-article-search.ts\n');
}

// Run
main().catch(console.error);
