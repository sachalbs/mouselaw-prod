/**
 * Script pour vérifier la structure et le contenu de la table jurisprudence
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkJurisprudenceStructure() {
  console.log('='.repeat(80));
  console.log('🔍 VÉRIFICATION DE LA TABLE JURISPRUDENCE');
  console.log('='.repeat(80));
  console.log('\n');

  // 1. Compter le nombre total d'entrées
  const { count, error: countError } = await supabase
    .from('case_law')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Erreur comptage:', countError);
    return;
  }

  console.log(`📊 Nombre total de décisions: ${count || 0}`);
  console.log('\n');

  // 2. Récupérer un échantillon
  const { data: sample, error: sampleError } = await supabase
    .from('case_law')
    .select('*')
    .limit(5);

  if (sampleError) {
    console.error('❌ Erreur échantillon:', sampleError);
    return;
  }

  if (!sample || sample.length === 0) {
    console.log('⚠️  Aucune décision dans la base');
    return;
  }

  // 3. Afficher les colonnes disponibles
  console.log('📋 Colonnes disponibles:');
  console.log('-'.repeat(80));
  const firstRow = sample[0];
  Object.keys(firstRow).forEach((key, idx) => {
    const value = firstRow[key];
    const type = Array.isArray(value) ? 'array' : typeof value;
    const hasValue = value !== null && value !== undefined && value !== '';

    console.log(`  ${idx + 1}. ${key.padEnd(20)} | Type: ${type.padEnd(10)} | ${hasValue ? '✅ Has data' : '❌ Empty'}`);
  });
  console.log('\n');

  // 4. Afficher un échantillon complet
  console.log('📝 Échantillon de décisions:');
  console.log('='.repeat(80));

  sample.forEach((decision, idx) => {
    console.log(`\n${idx + 1}. ${decision.titre?.substring(0, 80) || 'Sans titre'}...`);
    console.log(`   Juridiction : ${decision.juridiction}`);
    console.log(`   Date        : ${decision.date}`);
    console.log(`   Numéro      : ${decision.numero}`);
    console.log(`   ID          : ${decision.id}`);

    // Chercher des colonnes qui pourraient contenir un ID Légifrance
    const possibleIdFields = ['legifrance_id', 'judilibre_id', 'decision_id', 'external_id', 'url'];
    possibleIdFields.forEach(field => {
      if (field in decision && decision[field]) {
        console.log(`   ${field.padEnd(12)}: ${decision[field]}`);
      }
    });
  });

  console.log('\n');
  console.log('='.repeat(80));
  console.log('🔍 RECHERCHE D\'IDS JUDILIBRE/LÉGIFRANCE');
  console.log('='.repeat(80));
  console.log('\n');

  // 5. Vérifier si le numéro contient un format Judilibre
  const hasJudilibreFormat = sample.some(d =>
    d.numero?.includes('JURITEXT') ||
    d.numero?.match(/\d{17,}/)
  );

  if (hasJudilibreFormat) {
    console.log('✅ Certains numéros semblent contenir des IDs Judilibre');
    sample.forEach(d => {
      if (d.numero?.includes('JURITEXT') || d.numero?.match(/\d{17,}/)) {
        console.log(`   ${d.numero}`);
      }
    });
  } else {
    console.log('❌ Aucun ID Judilibre trouvé dans les numéros de décision');
  }

  console.log('\n');
  console.log('='.repeat(80));
  console.log('📊 ANALYSE');
  console.log('='.repeat(80));
  console.log('\n');

  // Analyse des données
  const hasLegifranceId = sample.some(d => 'legifrance_id' in d && d.legifrance_id);
  const hasJudilibreId = sample.some(d => 'judilibre_id' in d && d.judilibre_id);
  const hasUrl = sample.some(d => 'url' in d && d.url);

  if (hasLegifranceId || hasJudilibreId) {
    console.log('✅ La table contient déjà des IDs Légifrance/Judilibre');
    console.log('   → On peut créer des liens directs');
    console.log('\n💡 Action : Modifier lib/rag.ts pour utiliser ces IDs');
  } else if (hasUrl) {
    console.log('⚠️  La table contient des URLs mais pas d\'IDs séparés');
    console.log('   → On peut extraire les IDs depuis les URLs');
    console.log('\n💡 Action : Parser les URLs pour extraire les IDs');
  } else {
    console.log('❌ Aucun ID Légifrance/Judilibre trouvé');
    console.log('   → Les liens seront des liens de recherche (URL de recherche Légifrance)');
    console.log('\n💡 Options :');
    console.log('   1. Accepter les liens de recherche (MVP, fonctionne bien)');
    console.log('   2. Ajouter une colonne legifrance_id et importer les IDs');
    console.log('   3. Créer un script pour enrichir la base via l\'API Judilibre');
  }

  console.log('\n');
  console.log('='.repeat(80));
  console.log('🔗 EXEMPLE DE LIEN GÉNÉRÉ (recherche)');
  console.log('='.repeat(80));
  console.log('\n');

  if (sample[0]) {
    const decision = sample[0];
    const searchTerms = [
      decision.juridiction,
      decision.date,
      decision.numero
    ].join(' ');

    const searchUrl = `https://www.legifrance.gouv.fr/search/juri?tab_selection=juri&searchField=ALL&query=${encodeURIComponent(searchTerms)}&page=1&init=true&dateDecision=ALL`;

    console.log('Décision:', decision.titre?.substring(0, 60));
    console.log('URL:', searchUrl);
    console.log('\n✅ Ce type de lien fonctionne et trouve généralement la bonne décision');
  }
}

checkJurisprudenceStructure().catch(console.error);
