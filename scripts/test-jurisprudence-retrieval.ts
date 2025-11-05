#!/usr/bin/env npx tsx

/**
 * Script de diagnostic pour tester la retrieval de jurisprudence
 *
 * Ce script vérifie :
 * 1. Quelle table contient les données de jurisprudence
 * 2. Combien de décisions ont des embeddings
 * 3. Si la recherche par similarité fonctionne
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../lib/mistral/embeddings';

// Charger les variables d'environnement
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERREUR: Variables d\'environnement manquantes');
  console.error('   Vérifiez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   DIAGNOSTIC: Retrieval de Jurisprudence                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ============================================================================
  // 1. VÉRIFIER LA TABLE "jurisprudence"
  // ============================================================================
  console.log('📊 1. VÉRIFICATION DE LA TABLE "jurisprudence"\n');

  const { count: jurisCount, error: jurisCountError } = await supabase
    .from('jurisprudence')
    .select('*', { count: 'exact', head: true });

  if (jurisCountError) {
    console.log('   ⚠️  Table "jurisprudence" : ERREUR ou inexistante');
    console.log(`      ${jurisCountError.message}\n`);
  } else {
    console.log(`   ✅ Table "jurisprudence" : ${jurisCount || 0} lignes`);

    const { count: jurisEmbCount } = await supabase
      .from('jurisprudence')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`   ✅ Avec embeddings : ${jurisEmbCount || 0} / ${jurisCount || 0}`);
    console.log(`   📈 Pourcentage : ${jurisCount ? ((jurisEmbCount || 0) / jurisCount * 100).toFixed(1) : 0}%\n`);

    // Afficher quelques exemples
    if ((jurisEmbCount || 0) > 0) {
      const { data: samples } = await supabase
        .from('jurisprudence')
        .select('juridiction, date, numero, titre')
        .not('embedding', 'is', null)
        .limit(3);

      if (samples && samples.length > 0) {
        console.log('   📋 Exemples de décisions avec embeddings :');
        samples.forEach((s: any, idx: number) => {
          console.log(`      ${idx + 1}. ${s.juridiction} - ${s.date}`);
          console.log(`         n° ${s.numero}`);
          console.log(`         ${s.titre}\n`);
        });
      }
    }
  }

  // ============================================================================
  // 2. VÉRIFIER LA TABLE "case_law"
  // ============================================================================
  console.log('📊 2. VÉRIFICATION DE LA TABLE "case_law"\n');

  const { count: caseLawCount, error: caseLawCountError } = await supabase
    .from('case_law')
    .select('*', { count: 'exact', head: true });

  if (caseLawCountError) {
    console.log('   ⚠️  Table "case_law" : ERREUR ou inexistante');
    console.log(`      ${caseLawCountError.message}\n`);
  } else {
    console.log(`   ✅ Table "case_law" : ${caseLawCount || 0} lignes`);

    const { count: caseLawEmbCount } = await supabase
      .from('case_law')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`   ✅ Avec embeddings : ${caseLawEmbCount || 0} / ${caseLawCount || 0}`);
    console.log(`   📈 Pourcentage : ${caseLawCount ? ((caseLawEmbCount || 0) / caseLawCount * 100).toFixed(1) : 0}%\n`);
  }

  // ============================================================================
  // 3. DÉTERMINER LA TABLE À UTILISER
  // ============================================================================
  const useJurisprudence = (jurisCount || 0) > 0 && !jurisCountError;
  const useCaseLaw = (caseLawCount || 0) > 0 && !caseLawCountError;

  console.log('🎯 3. DÉCISION SUR LA TABLE À UTILISER\n');
  if (useJurisprudence) {
    console.log(`   ✅ Utiliser "jurisprudence" (${jurisCount} décisions)`);
  }
  if (useCaseLaw) {
    console.log(`   ⚠️  "case_law" existe aussi (${caseLawCount} décisions)`);
  }
  if (!useJurisprudence && !useCaseLaw) {
    console.log('   ❌ AUCUNE table valide trouvée !');
    process.exit(1);
  }

  // ============================================================================
  // 4. TEST DE RECHERCHE PAR SIMILARITÉ
  // ============================================================================
  console.log('\n🔍 4. TEST DE RECHERCHE PAR SIMILARITÉ\n');

  const testQuery = "vol de voiture et responsabilité du propriétaire";
  console.log(`   Question test : "${testQuery}"\n`);

  console.log('   🔮 Génération de l\'embedding...');
  const queryEmbedding = await generateEmbedding(testQuery);
  console.log(`   ✅ Embedding généré (${queryEmbedding.length} dimensions)\n`);

  if (useJurisprudence) {
    console.log('   🔍 Recherche dans "jurisprudence"...\n');

    const { data: jurisResults, error: jurisError } = await supabase
      .from('jurisprudence')
      .select('juridiction, date, numero, titre, principe, embedding')
      .not('embedding', 'is', null)
      .limit(500);

    if (jurisError) {
      console.error('   ❌ Erreur:', jurisError.message);
    } else if (!jurisResults || jurisResults.length === 0) {
      console.log('   ⚠️  Aucun résultat');
    } else {
      console.log(`   ✅ ${jurisResults.length} décisions récupérées`);

      // Calculer la similarité manuellement
      const resultsWithSimilarity = jurisResults.map((j: any) => {
        let embedding: number[];
        if (typeof j.embedding === 'string') {
          embedding = JSON.parse(j.embedding);
        } else {
          embedding = j.embedding;
        }

        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;

        for (let i = 0; i < queryEmbedding.length && i < embedding.length; i++) {
          dotProduct += queryEmbedding[i] * embedding[i];
          mag1 += queryEmbedding[i] * queryEmbedding[i];
          mag2 += embedding[i] * embedding[i];
        }

        const similarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));

        return {
          juridiction: j.juridiction,
          date: j.date,
          numero: j.numero,
          titre: j.titre,
          principe: j.principe?.substring(0, 150) || '',
          similarity
        };
      });

      // Trier par similarité
      resultsWithSimilarity.sort((a, b) => b.similarity - a.similarity);

      console.log('\n   📊 TOP 5 RÉSULTATS PAR SIMILARITÉ :\n');
      resultsWithSimilarity.slice(0, 5).forEach((r, idx) => {
        const badge = r.similarity >= 0.6 ? '✅' : '⚠️';
        console.log(`   ${badge} ${idx + 1}. Similarité: ${(r.similarity * 100).toFixed(2)}%`);
        console.log(`      ${r.juridiction} - ${r.date}`);
        console.log(`      n° ${r.numero}`);
        console.log(`      ${r.titre}`);
        if (r.principe) {
          console.log(`      "${r.principe}..."`);
        }
        console.log('');
      });

      // Statistiques
      const above60 = resultsWithSimilarity.filter(r => r.similarity >= 0.6).length;
      const above70 = resultsWithSimilarity.filter(r => r.similarity >= 0.7).length;

      console.log('   📈 STATISTIQUES :');
      console.log(`      • Décisions avec similarité ≥ 60% : ${above60}`);
      console.log(`      • Décisions avec similarité ≥ 70% : ${above70}`);
      console.log(`      • Meilleure similarité : ${(resultsWithSimilarity[0].similarity * 100).toFixed(2)}%\n`);
    }
  }

  // ============================================================================
  // 5. DIAGNOSTIC FINAL
  // ============================================================================
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   DIAGNOSTIC FINAL                                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (useJurisprudence && (jurisCount || 0) > 0) {
    const embPercentage = jurisCount ? ((Number(jurisEmbCount) || 0) / jurisCount * 100) : 0;
    if (embPercentage >= 95) {
      console.log('   ✅ La table "jurisprudence" est prête et opérationnelle');
      console.log(`   ✅ ${jurisEmbCount} / ${jurisCount} décisions ont des embeddings (${embPercentage.toFixed(1)}%)`);
      console.log('   ✅ La recherche par similarité fonctionne');
      console.log('\n   ⚠️  PROBLÈME IDENTIFIÉ :');
      console.log('       Le code dans lib/rag.ts cherche dans "case_law"');
      console.log('       mais les données sont dans "jurisprudence" !');
      console.log('\n   🔧 SOLUTION :');
      console.log('       Modifier searchRelevantJurisprudence() pour utiliser "jurisprudence"');
    } else {
      console.log(`   ⚠️  Embeddings incomplets : ${embPercentage.toFixed(1)}%`);
      console.log('   🔧 Lancer le script de génération d\'embeddings');
    }
  } else {
    console.log('   ❌ Problème avec la table de jurisprudence');
    console.log('   🔧 Vérifier l\'import des données');
  }

  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ ERREUR FATALE:', err);
    process.exit(1);
  });
