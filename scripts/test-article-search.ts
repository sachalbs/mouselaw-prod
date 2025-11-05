#!/usr/bin/env tsx

/**
 * Script de test détaillé de la recherche d'articles
 *
 * Ce script teste la recherche vectorielle pour identifier pourquoi
 * certains articles non pertinents sont retournés.
 *
 * Usage:
 *   npx tsx scripts/test-article-search.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

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

/**
 * Generate embedding using Mistral API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

  const response = await fetch(MISTRAL_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: MISTRAL_EMBED_MODEL,
      input: [text],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Search for articles with detailed scoring
 */
async function searchArticlesDetailed(
  query: string,
  limit: number = 10,
  threshold: number = 0.0 // Set to 0 to see all results
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 RECHERCHE: "${query}"`);
  console.log('='.repeat(80));

  // Generate embedding
  console.log(`\n⏳ Génération de l'embedding...`);
  const embedding = await generateEmbedding(query);
  console.log(`✅ Embedding généré: ${embedding.length} dimensions`);
  console.log(`   Échantillon: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}, ...]`);

  // Search in database
  console.log(`\n⏳ Recherche dans Supabase...`);
  console.log(`   • Limite: ${limit} résultats`);
  console.log(`   • Seuil: ${threshold}`);

  const { data, error } = await supabase.rpc('search_similar_articles', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error(`\n❌ Erreur Supabase:`, error);
    throw error;
  }

  if (!data || data.length === 0) {
    console.log(`\n⚠️  Aucun résultat trouvé!`);

    // Check database status
    const { count: totalArticles } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true });

    const { count: withEmbeddings } = await supabase
      .from('code_civil_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`\n📊 Statut de la base:`);
    console.log(`   • Total articles: ${totalArticles || 0}`);
    console.log(`   • Avec embeddings: ${withEmbeddings || 0}`);

    return [];
  }

  console.log(`\n✅ ${data.length} résultats trouvés\n`);

  // Display results
  console.log('📊 RÉSULTATS DÉTAILLÉS:');
  console.log('─'.repeat(80));

  const expectedArticles = ['1240', '1241', '1242'];
  const foundExpected: string[] = [];

  data.forEach((article: any, idx: number) => {
    const isExpected = expectedArticles.includes(article.article_number);
    if (isExpected) {
      foundExpected.push(article.article_number);
    }

    const marker = isExpected ? '🎯' : '  ';
    console.log(`\n${marker} ${idx + 1}. Article ${article.article_number}${article.title ? ` - ${article.title}` : ''}`);
    console.log(`   📊 Score de similarité: ${(article.similarity * 100).toFixed(2)}%`);
    console.log(`   📂 Catégorie: ${article.category || 'Non spécifié'}`);
    console.log(`   📜 Contenu:`);

    // Display full content for top 5 results, truncated for others
    const content = idx < 5 ? article.content : article.content.substring(0, 200) + '...';
    console.log(`      ${content.split('\n').join('\n      ')}`);
  });

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📋 RÉSUMÉ:');
  console.log(`   • Articles attendus (1240, 1241, 1242): ${expectedArticles.length}`);
  console.log(`   • Articles attendus trouvés: ${foundExpected.length} ${foundExpected.length > 0 ? `(${foundExpected.join(', ')})` : ''}`);

  if (foundExpected.length === 0) {
    console.log(`\n   ⚠️  PROBLÈME: Aucun article attendu dans les résultats!`);
  } else if (foundExpected.length < expectedArticles.length) {
    const missing = expectedArticles.filter(a => !foundExpected.includes(a));
    console.log(`\n   ⚠️  Articles manquants: ${missing.join(', ')}`);
  } else {
    console.log(`\n   ✅ Tous les articles attendus sont présents!`);
  }

  // Check if expected articles exist in database
  console.log(`\n🔍 Vérification de la présence des articles attendus dans la base...`);
  for (const num of expectedArticles) {
    const { data: article, error } = await supabase
      .from('code_civil_articles')
      .select('article_number, title, content, embedding')
      .eq('article_number', num)
      .single();

    if (error || !article) {
      console.log(`   ❌ Article ${num}: NON TROUVÉ dans la base`);
    } else {
      const hasEmbedding = article.embedding !== null;
      console.log(`   ${hasEmbedding ? '✅' : '❌'} Article ${num}: ${article.title || 'Sans titre'} ${hasEmbedding ? '(avec embedding)' : '(SANS embedding)'}`);

      if (hasEmbedding && !foundExpected.includes(num)) {
        // Calculate similarity manually
        const { data: result } = await supabase.rpc('search_similar_articles', {
          query_embedding: embedding,
          match_threshold: 0.0,
          match_count: 100,
        });

        const position = result?.findIndex((r: any) => r.article_number === num);
        if (position !== undefined && position >= 0) {
          const score = result[position].similarity;
          console.log(`      ⚠️  L'article est classé en position ${position + 1} avec un score de ${(score * 100).toFixed(2)}%`);
        }
      }
    }
  }

  return data;
}

/**
 * Test multiple queries
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              TEST DÉTAILLÉ DE LA RECHERCHE D\'ARTICLES                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  const queries = [
    {
      text: "responsabilité civile dommage",
      description: "Query basique"
    },
    {
      text: "Quelle est la responsabilité civile ?",
      description: "Question complète"
    },
    {
      text: "Article 1240 responsabilité dommage faute",
      description: "Query avec numéro d'article"
    },
    {
      text: "dommage causé à autrui faute",
      description: "Mots-clés du texte de l'article 1240"
    },
    {
      text: "Un piéton a été renversé par une voiture. Qui est responsable du dommage ?",
      description: "Cas pratique"
    }
  ];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];

    console.log(`\n\n${'█'.repeat(80)}`);
    console.log(`TEST ${i + 1}/${queries.length}: ${query.description}`);
    console.log('█'.repeat(80));

    try {
      await searchArticlesDetailed(query.text, 10, 0.0);
    } catch (error) {
      console.error(`\n❌ Erreur lors du test:`, error);
    }

    // Wait a bit between queries to avoid rate limiting
    if (i < queries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Final recommendations
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log('💡 RECOMMANDATIONS:');
  console.log('═'.repeat(80));
  console.log(`
Si les articles 1240, 1241, 1242 ne sont PAS dans les top résultats:

1. ✅ Vérifier que ces articles existent dans la base avec des embeddings
2. 📝 Vérifier le contenu des articles pour s'assurer qu'ils parlent bien de responsabilité
3. 🔧 Augmenter le seuil de similarité si trop de faux positifs
4. 🔄 Régénérer les embeddings si le contenu a changé
5. 📊 Utiliser un seuil adaptatif basé sur la distribution des scores

Si les articles sont trouvés mais mal classés:

1. 📈 Analyser les scores des articles mal classés vs bien classés
2. 🎯 Ajuster le seuil pour éliminer les faux positifs
3. 💬 Enrichir les embeddings en ajoutant le contexte (titre + catégorie + contenu)
4. 🔍 Tester différentes formulations de la query

Seuils recommandés:
- 0.70-0.75: Permissif (beaucoup de résultats, risque de faux positifs)
- 0.75-0.80: Équilibré (recommandé)
- 0.80-0.85: Strict (peu de résultats, haute précision)
- 0.85+    : Très strict (très peu de résultats)
`);
}

// Run the tests
main().catch(console.error);
