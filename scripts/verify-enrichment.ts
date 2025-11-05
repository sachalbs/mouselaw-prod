#!/usr/bin/env tsx

/**
 * Vérifier si les embeddings ont été générés avec le contenu enrichi
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyEnrichment() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   VÉRIFICATION DE L\'ENRICHISSEMENT DES EMBEDDINGS        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Vérifier les articles de responsabilité civile
  const { data, error } = await supabase
    .from('code_civil_articles')
    .select('article_number, title, content, category, keywords')
    .in('article_number', ['1240', '1241', '1242', '654'])
    .order('article_number');

  if (error) {
    console.error('❌ Erreur:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  Aucun article trouvé');
    return;
  }

  console.log(`📊 Vérification de ${data.length} articles:\n`);

  data.forEach((article: any) => {
    console.log('━'.repeat(70));
    console.log(`📌 Article ${article.article_number}`);
    console.log('━'.repeat(70));
    console.log(`   Titre: ${article.title || 'N/A'}`);
    console.log(`   Catégorie: ${article.category || 'N/A'}`);
    console.log(`   Keywords: ${article.keywords ? article.keywords.length + ' mots-clés' : 'N/A'}`);
    console.log(`\n   Contenu (300 premiers caractères):`);
    console.log(`   ${article.content.substring(0, 300)}...\n`);

    // Vérifier si le contenu est enrichi
    const hasArticleNumber = article.content.includes(`Article ${article.article_number} du Code civil`);
    const hasCategorie = article.content.includes('Catégorie:');
    const hasMotsCles = article.content.includes('Mots-clés:');
    const hasContenuLabel = article.content.includes('Contenu:');

    console.log(`   ⚙️  DIAGNOSTIC D'ENRICHISSEMENT:`);
    console.log(`      • "Article X du Code civil" au début ? ${hasArticleNumber ? '✅ OUI' : '❌ NON'}`);
    console.log(`      • Label "Catégorie:" ? ${hasCategorie ? '✅ OUI' : '❌ NON'}`);
    console.log(`      • Label "Mots-clés:" ? ${hasMotsCles ? '✅ OUI' : '❌ NON'}`);
    console.log(`      • Label "Contenu:" ? ${hasContenuLabel ? '✅ OUI' : '❌ NON'}`);

    const isEnriched = hasArticleNumber || hasCategorie || hasMotsCles || hasContenuLabel;

    if (isEnriched) {
      console.log(`\n   ✅ CET ARTICLE EST ENRICHI`);
    } else {
      console.log(`\n   ❌ CET ARTICLE N'EST PAS ENRICHI - CONTENU BRUT`);
    }
    console.log();
  });

  console.log('═'.repeat(70));
  console.log('🔍 CONCLUSION:\n');

  const enrichedCount = data.filter((article: any) =>
    article.content.includes(`Article ${article.article_number} du Code civil`) ||
    article.content.includes('Catégorie:') ||
    article.content.includes('Mots-clés:')
  ).length;

  if (enrichedCount === 0) {
    console.log('❌ AUCUN ARTICLE N\'EST ENRICHI !');
    console.log('\n⚠️  PROBLÈME DÉTECTÉ:');
    console.log('   Les embeddings ont été générés avec le contenu BRUT,');
    console.log('   pas avec le contenu enrichi.\n');
    console.log('💡 SOLUTION:');
    console.log('   1. Vérifier que createEnrichedContent() est bien utilisé');
    console.log('   2. TRUNCATE la table code_civil_articles');
    console.log('   3. Relancer scripts/import-and-embed.ts\n');
  } else if (enrichedCount < data.length) {
    console.log(`⚠️  ENRICHISSEMENT PARTIEL: ${enrichedCount}/${data.length} articles enrichis`);
    console.log('\n💡 Certains articles ont été générés avec l\'ancien système.');
    console.log('   Recommandation: régénérer tous les embeddings.\n');
  } else {
    console.log(`✅ TOUS LES ARTICLES SONT ENRICHIS (${enrichedCount}/${data.length})`);
    console.log('\n🎉 Le système d\'enrichissement fonctionne correctement!\n');
  }

  console.log('═'.repeat(70));
}

verifyEnrichment().catch(console.error);
