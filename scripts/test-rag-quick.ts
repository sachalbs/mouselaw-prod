#!/usr/bin/env tsx

/**
 * Test rapide du RAG avec les nouveaux paramètres
 */

import dotenv from 'dotenv';
import path from 'path';
import { searchRelevantSources } from '../lib/rag';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testRAG() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔬 TEST RAPIDE DU RAG AVEC NOUVEAUX PARAMÈTRES');
  console.log('═══════════════════════════════════════════════════════════\n');

  const queries = [
    'responsabilité civile dommage',
    'Quelle est la responsabilité civile ?',
    'Un piéton a été renversé par une voiture. Qui est responsable ?',
  ];

  for (const query of queries) {
    console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📝 Query: "${query}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      // Use default parameters from lib/rag.ts
      const results = await searchRelevantSources(query);

      console.log(`\n📊 RÉSULTATS:`);
      console.log(`   Articles trouvés: ${results.articles.length}`);
      console.log(`   Jurisprudence trouvée: ${results.jurisprudence.length}`);

      if (results.articles.length > 0) {
        console.log(`\n📚 Articles:`);
        results.articles.forEach((article, idx) => {
          const isTarget = ['1240', '1241', '1242'].includes(article.article_number);
          const marker = isTarget ? '🎯' : '  ';
          console.log(`   ${marker} ${idx + 1}. Article ${article.article_number} - ${(article.similarity * 100).toFixed(2)}%`);
        });

        // Check for target articles
        const foundTargets = results.articles
          .filter(a => ['1240', '1241', '1242'].includes(a.article_number))
          .map(a => a.article_number);

        console.log(`\n   🎯 Articles cibles trouvés: ${foundTargets.length}/3`);
        if (foundTargets.length > 0) {
          console.log(`      Trouvés: ${foundTargets.join(', ')}`);
        }

        const missing = ['1240', '1241', '1242'].filter(n => !foundTargets.includes(n));
        if (missing.length > 0) {
          console.log(`      Manquants: ${missing.join(', ')}`);
        }
      } else {
        console.log(`\n   ⚠️  Aucun article trouvé avec ces paramètres`);
      }

      // Wait between queries
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error('❌ Erreur:', error);
    }
  }

  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('✅ Tests terminés');
  console.log('═══════════════════════════════════════════════════════════\n');
}

testRAG().catch(console.error);
