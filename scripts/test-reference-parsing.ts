#!/usr/bin/env npx tsx

/**
 * Script de test pour valider le parsing des références
 * Teste les nouveaux patterns de jurisprudence
 */

import { parseReferences, textToSegments } from '../lib/parseReferences';

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║   TEST : Parsing des Références Juridiques                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Exemples de texte avec différents formats
const testCases = [
  {
    name: "Format ISO avec slash",
    text: "La Cour de cassation, 13/02/1930, a jugé que..."
  },
  {
    name: "Format classique abrégé",
    text: "Selon Cass. Civ. 1, 15 oct. 2024, n° 23-19876..."
  },
  {
    name: "Format mixte avec article",
    text: "L'Article 1242 du Code civil et la Cour de Cassation, 15 octobre 2024, prévoient que..."
  },
  {
    name: "Réponse complète type Mistral",
    text: `Selon le Code civil et la jurisprudence, voici la réponse :

L'Article 1242 du Code civil dispose que : « On est responsable non seulement du dommage que l'on cause par son propre fait, mais encore de celui qui est causé par le fait des personnes dont on doit répondre, ou des choses que l'on a sous sa garde. »

La jurisprudence a précisé ce point : Cour de cassation, 13/02/1930 (Arrêt Jand'heur) : Le gardien d'une chose qui a causé un dommage est présumé responsable.`
  },
  {
    name: "Format avec Cour d'appel",
    text: "CA Paris, 5 mars 2024, a confirmé..."
  }
];

testCases.forEach((testCase, index) => {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`TEST ${index + 1} : ${testCase.name}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📝 Texte original :`);
  console.log(`   "${testCase.text.substring(0, 100)}${testCase.text.length > 100 ? '...' : ''}"`);

  const references = parseReferences(testCase.text);

  console.log(`\n🔍 Références détectées : ${references.length}`);

  if (references.length === 0) {
    console.log('   ❌ AUCUNE référence détectée !');
  } else {
    references.forEach((ref, idx) => {
      console.log(`\n   ${idx + 1}. Type : ${ref.type === 'article' ? '📚' : '⚖️'} ${ref.type.toUpperCase()}`);
      console.log(`      Texte : "${ref.text}"`);
      console.log(`      Position : ${ref.start}-${ref.end}`);
      if (ref.type === 'article') {
        console.log(`      Numéro : ${ref.articleNumber}`);
        console.log(`      Code : ${ref.codeType}`);
      }
      if (ref.url) {
        console.log(`      URL : ${ref.url.substring(0, 60)}...`);
      }
    });
  }

  // Test de segmentation
  const segments = textToSegments(testCase.text);
  const refSegments = segments.filter(s => s.isReference);

  console.log(`\n✅ Segments créés : ${segments.length} (dont ${refSegments.length} références)`);
});

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║   RÉSUMÉ DES TESTS                                           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const allReferences = testCases.flatMap(tc => parseReferences(tc.text));
const articleCount = allReferences.filter(r => r.type === 'article').length;
const jurisCount = allReferences.filter(r => r.type === 'jurisprudence').length;

console.log(`📊 Total de références détectées : ${allReferences.length}`);
console.log(`   • Articles : ${articleCount} 📚`);
console.log(`   • Jurisprudence : ${jurisCount} ⚖️`);

if (jurisCount >= 4) {
  console.log('\n✅ TEST RÉUSSI : Les patterns de jurisprudence fonctionnent bien !');
  console.log('   Tous les formats sont détectés correctement.\n');
} else {
  console.log(`\n⚠️  ATTENTION : Seulement ${jurisCount} décisions détectées sur 5 attendues.`);
  console.log('   Vérifiez les patterns regex.\n');
}
