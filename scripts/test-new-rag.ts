#!/usr/bin/env tsx

/**
 * Test the NEW RAG system with enriched embeddings and hybrid search
 */

import dotenv from 'dotenv';
import path from 'path';
import { searchRelevantSources } from '../lib/rag';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testNewRAG() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       TEST NEW RAG - Enriched Content + Hybrid Search    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const testQueries = [
    {
      name: 'Test 1: Exact article number',
      query: 'Article 1240 du Code civil',
      expectedArticles: ['1240'],
    },
    {
      name: 'Test 2: Exact with semantic context',
      query: 'Article 1240 responsabilité dommage',
      expectedArticles: ['1240', '1241'],
    },
    {
      name: 'Test 3: Pure semantic search',
      query: 'Quelle est la responsabilité civile ?',
      expectedArticles: ['1240', '1241', '1242', '1243'],
    },
    {
      name: 'Test 4: Cas pratique',
      query: 'Un propriétaire de voiture cause un accident. Qui est responsable ?',
      expectedArticles: ['1240', '1241'],
    },
  ];

  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${test.name}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`📝 Query: "${test.query}"\n`);

    try {
      const results = await searchRelevantSources(test.query);

      console.log(`\n✅ RESULTS:`);
      console.log(`   Total sources: ${results.totalSources}`);
      console.log(`   Articles: ${results.articles.length}`);
      console.log(`   Jurisprudence: ${results.jurisprudence.length}\n`);

      if (results.articles.length > 0) {
        console.log(`📚 TOP ARTICLES:`);
        results.articles.slice(0, 10).forEach((article, idx) => {
          const isExpected = test.expectedArticles.includes(article.article_number);
          const badge = article.similarity === 1.0 ? '🎯 EXACT' : '🔮 VECTOR';
          const mark = isExpected ? '✅' : '  ';
          console.log(`   ${mark} ${idx + 1}. ${badge} Article ${article.article_number} - ${(article.similarity * 100).toFixed(1)}%`);
        });

        // Check expected articles
        const foundExpected = test.expectedArticles.filter(num =>
          results.articles.find(a => a.article_number === num)
        );

        console.log(`\n📊 EXPECTED ARTICLES: ${foundExpected.length}/${test.expectedArticles.length}`);
        if (foundExpected.length > 0) {
          console.log(`   Found: ${foundExpected.join(', ')}`);
        }
        const missing = test.expectedArticles.filter(num => !foundExpected.includes(num));
        if (missing.length > 0) {
          console.log(`   Missing: ${missing.join(', ')}`);
        }
      } else {
        console.log(`   ⚠️  No articles found`);
      }

      // Wait between queries to avoid rate limiting
      if (i < testQueries.length - 1) {
        console.log(`\n⏳ Waiting 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`\n❌ ERROR:`, error);
    }
  }

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('📊 SUMMARY - NEW RAG FEATURES:');
  console.log('═'.repeat(70));
  console.log(`
✅ ENRICHED CONTENT:
   • Article number + title + category labels
   • Full content with legal keywords
   • Better semantic understanding

✅ HYBRID SEARCH:
   • Exact match for "Article [number]" queries
   • Vector similarity for semantic queries
   • Combined and deduplicated results

✅ SMART FILTERING:
   • Strict threshold (0.75) for vector results
   • Always includes exact matches (score 1.0)
   • Top 20 most relevant articles

🎯 EXPECTED IMPROVEMENTS:
   • "Article 1240" → Should find Article 1240 with 100% score
   • Semantic queries → Should find articles 1240, 1241, 1242, 1243
   • Better ranking of relevant articles
   • Fewer false positives
`);
}

testNewRAG().catch(console.error);
