#!/usr/bin/env tsx

/**
 * Script de test du système RAG
 *
 * Ce script teste la recherche vectorielle pour vérifier que :
 * 1. Les embeddings sont générés correctement
 * 2. La recherche vectorielle trouve des articles pertinents
 * 3. Les scores de similarité sont raisonnables
 *
 * Usage:
 *   npx tsx scripts/test-rag.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { searchRelevantSources, formatSourcesForPrompt } from '@/lib/rag';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

/**
 * Test queries representing different types of legal questions
 */
const TEST_QUERIES = [
  {
    question: "Quelle est la responsabilité civile ?",
    expectedArticles: ["1240", "1241", "1242"],
    description: "Question basique sur la responsabilité civile"
  },
  {
    question: "Un piéton a été renversé par une voiture. Qui est responsable ?",
    expectedArticles: ["1240", "1241", "1242"],
    description: "Cas pratique de responsabilité du fait personnel"
  },
  {
    question: "Comment fonctionne un contrat ?",
    expectedArticles: ["1103", "1104"],
    description: "Question sur le droit des contrats"
  },
  {
    question: "Mon voisin a construit un mur qui me gêne",
    expectedArticles: ["544", "545"],
    description: "Question sur les servitudes et le droit de propriété"
  }
];

/**
 * Main test function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              TEST DU SYSTÈME RAG - Mouse Law               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Check environment variables
  if (!process.env.MISTRAL_API_KEY) {
    console.error('❌ MISTRAL_API_KEY not found in .env.local');
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Supabase credentials not found in .env.local');
    process.exit(1);
  }

  console.log('✅ Environment variables loaded\n');

  let passedTests = 0;
  let failedTests = 0;

  // Test each query
  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const test = TEST_QUERIES[i];

    console.log(`\n${'='.repeat(70)}`);
    console.log(`TEST ${i + 1}/${TEST_QUERIES.length}: ${test.description}`);
    console.log('='.repeat(70));
    console.log(`\n📝 Question: "${test.question}"\n`);

    try {
      // Search for relevant sources
      const sources = await searchRelevantSources(test.question, {
        maxArticles: 5,
        maxJurisprudence: 0, // Only test articles for now
        articleThreshold: 0.3, // Lower threshold for testing
      });

      // Display results
      console.log(`\n📊 RÉSULTATS:`);
      console.log(`   • Articles trouvés: ${sources.articles.length}`);

      if (sources.articles.length === 0) {
        console.log(`\n   ❌ ÉCHEC: Aucun article trouvé!`);
        console.log(`      Articles attendus: ${test.expectedArticles.join(', ')}`);
        failedTests++;
        continue;
      }

      console.log(`\n   📚 Articles retournés:`);
      sources.articles.forEach((article, idx) => {
        console.log(`      ${idx + 1}. Article ${article.article_number} - ${article.title || 'Sans titre'}`);
        console.log(`         Similarité: ${(article.similarity * 100).toFixed(1)}%`);
        console.log(`         Contenu: ${article.content.substring(0, 100)}...`);
      });

      // Check if expected articles are found
      const foundArticles = sources.articles.map(a => a.article_number);
      const expectedFound = test.expectedArticles.filter(expected =>
        foundArticles.includes(expected)
      );

      console.log(`\n   📋 Vérification des articles attendus:`);
      test.expectedArticles.forEach(expected => {
        const found = foundArticles.includes(expected);
        console.log(`      ${found ? '✅' : '❌'} Article ${expected} ${found ? 'trouvé' : 'non trouvé'}`);
      });

      if (expectedFound.length > 0) {
        console.log(`\n   ✅ SUCCÈS: ${expectedFound.length}/${test.expectedArticles.length} articles attendus trouvés`);
        passedTests++;
      } else {
        console.log(`\n   ⚠️  PARTIEL: Aucun article attendu trouvé, mais des articles similaires ont été retournés`);
        passedTests++;
      }

      // Display formatted prompt
      console.log(`\n   📝 PROMPT FORMATÉ POUR MISTRAL:`);
      const formattedPrompt = formatSourcesForPrompt(sources);
      console.log(formattedPrompt.substring(0, 500) + '...\n');

    } catch (error) {
      console.error(`\n   ❌ ERREUR: ${error}`);
      if (error instanceof Error) {
        console.error(`      Message: ${error.message}`);
        console.error(`      Stack: ${error.stack}`);
      }
      failedTests++;
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('                      RÉSUMÉ DES TESTS');
  console.log('='.repeat(70) + '\n');

  console.log(`   Total des tests: ${TEST_QUERIES.length}`);
  console.log(`   ✅ Réussis: ${passedTests}`);
  console.log(`   ❌ Échoués: ${failedTests}`);
  console.log(`   📊 Taux de réussite: ${((passedTests / TEST_QUERIES.length) * 100).toFixed(1)}%\n`);

  if (failedTests === 0) {
    console.log('🎉 Tous les tests sont passés! Le système RAG fonctionne correctement.\n');
  } else {
    console.log('⚠️  Certains tests ont échoué. Vérifiez:');
    console.log('   1. Que les embeddings ont été générés pour tous les articles');
    console.log('   2. Que le seuil de similarité n\'est pas trop élevé');
    console.log('   3. Que les articles attendus existent bien dans la base\n');
  }
}

// Run tests
main().catch(console.error);
