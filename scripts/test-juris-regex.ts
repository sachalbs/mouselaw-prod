/**
 * Script de test pour vérifier la détection de jurisprudence
 */

// Pattern actuel
const CURRENT_PATTERN = /(?:Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)(?:\s+(?:Civ\.|Comm\.|Soc\.|Crim\.|Ch\.\s+mixte)\s*\d*)?[\s,]+\d{1,2}[\s/](?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\.|févr\.|avr\.|juil\.|sept\.|oct\.|nov\.|déc\.|[\d]{1,2}[\s/])(?:\s|\/)?\d{4}(?:[\s,]+n°?\s*[\d-]+)?/gi;

// Cas de test
const testCases = [
  "Cour de Cassation - 15/11/2024, n° 23-15432",
  "Cass. Civ. 1, 15 oct. 2024, n° 23-19876",
  "Cour de cassation, 13/02/1930",
  "Cour de Cassation, 15 octobre 2024",
  "CA Paris, 5 mars 2024",
  "Cass. soc., 12 juin 2024",
];

console.log('='.repeat(80));
console.log('🧪 TEST DU PATTERN ACTUEL');
console.log('='.repeat(80));
console.log('\n');

testCases.forEach((testCase, idx) => {
  const regex = new RegExp(CURRENT_PATTERN);
  const match = regex.exec(testCase);

  console.log(`Test ${idx + 1}: "${testCase}"`);
  if (match) {
    console.log(`  ✅ MATCH: "${match[0]}"`);
  } else {
    console.log(`  ❌ PAS DE MATCH`);
  }
  console.log('');
});

// Pattern amélioré qui accepte les traits d'union et les dates DD/MM/YYYY
const IMPROVED_PATTERN = /(?:Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)(?:\s+(?:Civ\.|Comm\.|Soc\.|Crim\.|Ch\.\s+mixte)\s*\d*)?[\s,\-]+(?:\d{1,2}[\s/\-](?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\.|févr\.|avr\.|juil\.|sept\.|oct\.|nov\.|déc\.)\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})(?:[\s,]*n°?\s*[\d\-]+)?/gi;

console.log('='.repeat(80));
console.log('🔧 TEST DU PATTERN AMÉLIORÉ');
console.log('='.repeat(80));
console.log('\n');

testCases.forEach((testCase, idx) => {
  const regex = new RegExp(IMPROVED_PATTERN);
  const match = regex.exec(testCase);

  console.log(`Test ${idx + 1}: "${testCase}"`);
  if (match) {
    console.log(`  ✅ MATCH: "${match[0]}"`);
  } else {
    console.log(`  ❌ PAS DE MATCH`);
  }
  console.log('');
});

console.log('='.repeat(80));
console.log('📊 RÉSUMÉ');
console.log('='.repeat(80));
console.log('\n');

const currentMatches = testCases.filter(tc => new RegExp(CURRENT_PATTERN).test(tc)).length;
const improvedMatches = testCases.filter(tc => new RegExp(IMPROVED_PATTERN).test(tc)).length;

console.log(`Pattern actuel    : ${currentMatches}/${testCases.length} cas détectés`);
console.log(`Pattern amélioré  : ${improvedMatches}/${testCases.length} cas détectés`);
