/**
 * Script de diagnostic RAG Jurisprudence
 *
 * Objectif : Identifier pourquoi le RAG ne retourne pas de jurisprudence
 *
 * Usage:
 *   npx tsx scripts/test-rag-jurisprudence.ts
 */

import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const TEST_QUERY = "responsabilité civile article 1240";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// MISTRAL EMBEDDING (copié localement)
// ============================================================================

const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings';
const MISTRAL_EMBED_MODEL = 'mistral-embed';

interface EmbeddingResponse {
  id: string;
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not configured');
  }

  const response = await fetch(MISTRAL_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_EMBED_MODEL,
      input: [text],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mistral Embed API error: ${response.status} - ${errorText}`
    );
  }

  const data: EmbeddingResponse = await response.json();

  if (!data.data || data.data.length === 0) {
    throw new Error('No embedding returned from Mistral Embed API');
  }

  return data.data[0].embedding;
}

// ============================================================================
// CALCUL DE SIMILARITÉ COSINUS
// ============================================================================

function cosineSimilarity(vec1: number[], vec2: number[]): number {
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length && i < vec2.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }

  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

// ============================================================================
// FONCTION DE PARSING EMBEDDING
// ============================================================================

function parseEmbedding(embedding: any): number[] {
  if (typeof embedding === 'string') {
    try {
      return JSON.parse(embedding);
    } catch {
      // Essayer le format pgvector brut [0.1,0.2,...]
      const cleaned = embedding.replace(/^\[|\]$/g, '');
      return cleaned.split(',').map((s: string) => parseFloat(s.trim()));
    }
  } else if (Array.isArray(embedding)) {
    return embedding;
  }
  return [];
}

// ============================================================================
// TESTS
// ============================================================================

async function testDirectSupabase(queryEmbedding: number[]) {
  console.log('\n1️⃣  RECHERCHE DIRECTE SUPABASE - TABLE case_law');
  console.log('━'.repeat(70));

  try {
    // Vérifier si la table existe
    const { data: caseData, error: caseError, count: caseCount } = await supabase
      .from('case_law')
      .select('*', { count: 'exact', head: true });

    if (caseError) {
      console.log(`   ❌ Erreur table case_law: ${caseError.message}`);
      console.log(`   💡 Code erreur: ${caseError.code}`);

      if (caseError.code === '42P01') {
        console.log(`   ⚠️  La table 'case_law' n'existe pas dans Supabase !`);
        return { exists: false, count: 0, results: [] };
      }
      return { exists: false, count: 0, results: [] };
    }

    console.log(`   ✅ Table case_law existe`);
    console.log(`   📊 Nombre total de décisions: ${caseCount || 0}`);

    // Récupérer décisions avec embeddings
    const { data, error } = await supabase
      .from('case_law')
      .select('id, title, decision_date, summary, full_text, embedding')
      .not('embedding', 'is', null)
      .limit(100);

    if (error) {
      console.log(`   ❌ Erreur requête: ${error.message}`);
      return { exists: true, count: caseCount || 0, results: [] };
    }

    if (!data || data.length === 0) {
      console.log(`   ⚠️  Aucune décision avec embedding trouvée`);
      return { exists: true, count: caseCount || 0, results: [] };
    }

    console.log(`   ✅ ${data.length} décisions trouvées avec embeddings`);

    // Calculer similarité pour chaque décision
    const withScores = data
      .map((d: any) => {
        const embedding = parseEmbedding(d.embedding);
        if (embedding.length === 0) {
          return null;
        }

        const similarity = cosineSimilarity(queryEmbedding, embedding);

        return {
          id: d.id,
          title: d.title,
          decision_date: d.decision_date,
          summary: d.summary?.substring(0, 100),
          similarity,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => b.similarity - a.similarity);

    console.log(`\n   🎯 Top 5 résultats par score de similarité:`);
    withScores.slice(0, 5).forEach((d, idx) => {
      console.log(`\n   ${idx + 1}. Score: ${d.similarity.toFixed(4)} (${(d.similarity * 100).toFixed(2)}%)`);
      console.log(`      Titre: ${d.title}`);
      console.log(`      Date: ${d.decision_date}`);
      if (d.summary) {
        console.log(`      Résumé: ${d.summary}...`);
      }
    });

    // Appliquer threshold 0.40
    const aboveThreshold = withScores.filter(d => d.similarity >= 0.40);
    console.log(`\n   📈 Décisions au-dessus du threshold 0.40: ${aboveThreshold.length}/${withScores.length}`);

    return { exists: true, count: caseCount || 0, results: aboveThreshold };

  } catch (error: any) {
    console.log(`   ❌ Exception: ${error.message}`);
    return { exists: false, count: 0, results: [] };
  }
}

async function testDirectSupabaseJurisprudence(queryEmbedding: number[]) {
  console.log('\n2️⃣  RECHERCHE DIRECTE SUPABASE - TABLE jurisprudence');
  console.log('━'.repeat(70));

  try {
    // Vérifier si la table existe
    const { data: juriData, error: juriError, count: juriCount } = await supabase
      .from('jurisprudence')
      .select('*', { count: 'exact', head: true });

    if (juriError) {
      console.log(`   ❌ Erreur table jurisprudence: ${juriError.message}`);

      if (juriError.code === '42P01') {
        console.log(`   ⚠️  La table 'jurisprudence' n'existe pas dans Supabase !`);
        return { exists: false, count: 0, results: [] };
      }
      return { exists: false, count: 0, results: [] };
    }

    console.log(`   ✅ Table jurisprudence existe`);
    console.log(`   📊 Nombre total de décisions: ${juriCount || 0}`);

    // Récupérer décisions avec embeddings
    const { data, error } = await supabase
      .from('jurisprudence')
      .select('id, titre, date, numero, solution, principe, embedding')
      .not('embedding', 'is', null)
      .limit(100);

    if (error) {
      console.log(`   ❌ Erreur requête: ${error.message}`);
      return { exists: true, count: juriCount || 0, results: [] };
    }

    if (!data || data.length === 0) {
      console.log(`   ⚠️  Aucune décision avec embedding trouvée`);
      return { exists: true, count: juriCount || 0, results: [] };
    }

    console.log(`   ✅ ${data.length} décisions trouvées avec embeddings`);

    // Calculer similarité pour chaque décision
    const withScores = data
      .map((d: any) => {
        const embedding = parseEmbedding(d.embedding);
        if (embedding.length === 0) {
          return null;
        }

        const similarity = cosineSimilarity(queryEmbedding, embedding);

        return {
          id: d.id,
          titre: d.titre,
          date: d.date,
          numero: d.numero,
          principe: d.principe?.substring(0, 100),
          similarity,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => b.similarity - a.similarity);

    console.log(`\n   🎯 Top 5 résultats par score de similarité:`);
    withScores.slice(0, 5).forEach((d, idx) => {
      console.log(`\n   ${idx + 1}. Score: ${d.similarity.toFixed(4)} (${(d.similarity * 100).toFixed(2)}%)`);
      console.log(`      Titre: ${d.titre}`);
      console.log(`      Date: ${d.date}`);
      console.log(`      Numéro: ${d.numero}`);
      if (d.principe) {
        console.log(`      Principe: ${d.principe}...`);
      }
    });

    // Appliquer threshold 0.40
    const aboveThreshold = withScores.filter(d => d.similarity >= 0.40);
    console.log(`\n   📈 Décisions au-dessus du threshold 0.40: ${aboveThreshold.length}/${withScores.length}`);

    return { exists: true, count: juriCount || 0, results: aboveThreshold };

  } catch (error: any) {
    console.log(`   ❌ Exception: ${error.message}`);
    return { exists: false, count: 0, results: [] };
  }
}

async function testViaRagLib() {
  console.log('\n3️⃣  RECHERCHE VIA lib/rag.ts (fonction searchRelevantSources)');
  console.log('━'.repeat(70));

  try {
    // Importer dynamiquement pour éviter les erreurs de chargement
    const { searchRelevantSources } = await import('../lib/rag');

    const sources = await searchRelevantSources(TEST_QUERY, {
      maxArticles: 3,
      maxJurisprudence: 8,
      maxMethodologies: 0,
      articleThreshold: 0.75,
      jurisprudenceThreshold: 0.40,
      methodologyThreshold: 0.65,
    });

    console.log(`   📚 Articles trouvés: ${sources.articles.length}`);
    console.log(`   ⚖️  Jurisprudence trouvée: ${sources.jurisprudence.length}`);

    if (sources.jurisprudence.length > 0) {
      console.log(`\n   ✅ SUCCESS: Le RAG retourne de la jurisprudence !`);
      console.log(`\n   🎯 Top résultats:`);
      sources.jurisprudence.slice(0, 3).forEach((j, idx) => {
        console.log(`\n   ${idx + 1}. Score: ${(j.similarity * 100).toFixed(2)}%`);
        console.log(`      ${j.juridiction} - ${j.date}`);
        console.log(`      Titre: ${j.titre}`);
      });
    } else {
      console.log(`\n   ❌ PROBLÈME: Le RAG ne retourne AUCUNE jurisprudence`);
      console.log(`   💡 Vérifier la fonction searchRelevantJurisprudence dans lib/rag.ts`);
    }

    return sources;

  } catch (error: any) {
    console.log(`   ❌ Erreur lors de l'import de lib/rag.ts: ${error.message}`);
    console.log(`   💡 Détails: ${error.stack}`);
    return null;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 TEST RAG JURISPRUDENCE - DIAGNOSTIC COMPLET                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  console.log(`🔍 Requête de test: "${TEST_QUERY}"`);

  // 1. Générer embedding
  console.log('\n⚙️  Génération de l\'embedding Mistral...');
  const queryEmbedding = await generateEmbedding(TEST_QUERY);
  console.log(`   ✅ Embedding généré: ${queryEmbedding.length} dimensions`);
  console.log(`   📊 Premiers valeurs: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}, ...]`);

  // 2. Test direct case_law
  const caseResults = await testDirectSupabase(queryEmbedding);

  // 3. Test direct jurisprudence
  const juriResults = await testDirectSupabaseJurisprudence(queryEmbedding);

  // 4. Test via lib/rag.ts
  const ragResults = await testViaRagLib();

  // 5. Analyse comparative
  console.log('\n\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   📊 ANALYSE COMPARATIVE                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Résumé des résultats:\n');
  console.log(`   Table case_law:`);
  console.log(`   ${caseResults.exists ? '✅' : '❌'} Existe: ${caseResults.exists}`);
  console.log(`   📊 Total décisions: ${caseResults.count}`);
  console.log(`   🎯 Résultats pertinents (≥0.40): ${caseResults.results.length}`);

  console.log(`\n   Table jurisprudence:`);
  console.log(`   ${juriResults.exists ? '✅' : '❌'} Existe: ${juriResults.exists}`);
  console.log(`   📊 Total décisions: ${juriResults.count}`);
  console.log(`   🎯 Résultats pertinents (≥0.40): ${juriResults.results.length}`);

  console.log(`\n   Recherche RAG (lib/rag.ts):`);
  console.log(`   ${ragResults ? '✅' : '❌'} Fonctionne: ${ragResults ? 'Oui' : 'Non'}`);
  if (ragResults) {
    console.log(`   📚 Articles: ${ragResults.articles.length}`);
    console.log(`   ⚖️  Jurisprudence: ${ragResults.jurisprudence.length}`);
  }

  // 6. Diagnostic final
  console.log('\n\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   🔬 DIAGNOSTIC FINAL                                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  if (!caseResults.exists && !juriResults.exists) {
    console.log('❌ PROBLÈME CRITIQUE:\n');
    console.log('   Aucune des deux tables n\'existe dans Supabase !');
    console.log('   - Table case_law: ❌ Inexistante');
    console.log('   - Table jurisprudence: ❌ Inexistante');
    console.log('\n💡 SOLUTION:');
    console.log('   Appliquer une migration SQL pour créer case_law + jurisdictions');
    console.log('   Voir: DIAGNOSTIC_MOUSELAW.md section "Solutions recommandées"');
  } else if (!caseResults.exists && juriResults.exists) {
    console.log('⚠️  PROBLÈME IDENTIFIÉ:\n');
    console.log('   Le code cherche dans case_law, mais seule jurisprudence existe !');
    console.log(`   - Table case_law: ❌ Inexistante`);
    console.log(`   - Table jurisprudence: ✅ Existe (${juriResults.count} décisions)`);
    console.log('\n💡 SOLUTIONS POSSIBLES:');
    console.log('   A) Créer case_law et migrer les données de jurisprudence');
    console.log('   B) Modifier lib/rag.ts pour lire jurisprudence au lieu de case_law');
    console.log('\n📁 Fichiers à modifier:');
    console.log('   - lib/rag.ts ligne 338 : .from(\'case_law\') → .from(\'jurisprudence\')');
  } else if (caseResults.exists && juriResults.exists) {
    console.log('✅ Les deux tables existent\n');
    if (caseResults.count === 0 && juriResults.count > 0) {
      console.log('⚠️  Mais case_law est vide, alors que jurisprudence contient des données\n');
      console.log('💡 SOLUTION: Migrer les données de jurisprudence vers case_law');
    } else if (caseResults.count > 0) {
      if (ragResults && ragResults.jurisprudence.length === 0) {
        console.log('⚠️  Les données existent mais le RAG ne retourne rien\n');
        console.log('💡 Problème probable dans lib/rag.ts:');
        console.log('   - Vérifier le JOIN avec jurisdictions');
        console.log('   - Vérifier le threshold de similarité');
        console.log('   - Vérifier le parsing des embeddings');
      } else {
        console.log('✅ TOUT FONCTIONNE ! Le RAG retourne de la jurisprudence.\n');
      }
    }
  } else if (caseResults.exists && !juriResults.exists) {
    console.log('✅ Configuration correcte\n');
    console.log(`   - Table case_law: ✅ Existe (${caseResults.count} décisions)`);
    if (caseResults.count === 0) {
      console.log('\n⚠️  Mais la table est VIDE\n');
      console.log('💡 SOLUTION: Importer les données de jurisprudence');
      console.log('   npx tsx scripts/import-cass-xml.ts --limit=2000');
    } else if (caseResults.results.length === 0) {
      console.log('\n⚠️  Aucune décision avec embeddings trouvée\n');
      console.log('💡 SOLUTION: Générer les embeddings');
    } else if (ragResults && ragResults.jurisprudence.length === 0) {
      console.log('\n⚠️  Données OK mais RAG retourne 0 résultats\n');
      console.log('💡 Vérifier lib/rag.ts ligne 338 (JOIN avec jurisdictions)');
    }
  }

  console.log('\n✅ Test terminé\n');
}

main().catch((error) => {
  console.error('\n❌ Erreur fatale:', error);
  process.exit(1);
});
