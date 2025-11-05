/**
 * Script de test de l'API Légifrance (PISTE)
 *
 * Usage:
 *   npx tsx scripts/test-legifrance-api.ts
 *
 * Teste :
 * - Authentification OAuth PISTE
 * - Appel API pour récupérer un code
 * - Format de la réponse
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// Charger explicitement .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const OAUTH_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';
const API_URL = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';

// Code civil pour le test
const TEST_CODE_ID = 'LEGITEXT000006070721';

/**
 * Obtient un token OAuth PISTE
 */
async function getToken(): Promise<string> {
  console.log('🔐 Test authentification OAuth PISTE...\n');

  const credentials = Buffer.from(
    `${process.env.LEGIFRANCE_CLIENT_ID}:${process.env.LEGIFRANCE_CLIENT_SECRET}`
  ).toString('base64');

  console.log(`   URL: ${OAUTH_URL}`);
  console.log(`   Method: POST`);
  console.log(`   Authorization: Basic ${credentials.substring(0, 20)}...`);

  const response = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=openid',
  });

  console.log(`   Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur OAuth: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log(`   ✅ Token obtenu`);
  console.log(`   Token: ${data.access_token.substring(0, 30)}...`);
  console.log(`   Expire dans: ${data.expires_in}s`);

  return data.access_token;
}

/**
 * Teste l'appel API Légifrance
 */
async function testAPI(token: string): Promise<void> {
  console.log('\n📚 Test API Légifrance (consult/code)...\n');

  const url = `${API_URL}/consult/code`;
  const body = {
    textId: TEST_CODE_ID,
    date: new Date().toISOString().split('T')[0],
  };

  console.log(`   URL: ${url}`);
  console.log(`   Method: POST`);
  console.log(`   Authorization: Bearer ${token.substring(0, 30)}...`);
  console.log(`   Body: ${JSON.stringify(body, null, 2)}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  console.log(`\n   Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const error = await response.text();
    console.error(`\n❌ ERREUR API:`);
    console.error(`   Status: ${response.status}`);
    console.error(`   Message: ${error.substring(0, 500)}`);
    throw new Error(`Erreur API: ${response.status}`);
  }

  const data = await response.json();
  console.log(`   ✅ Réponse reçue`);

  // Analyser la structure
  if (data.sections || data.articles || data.enfants) {
    let articleCount = 0;

    function countArticles(node: any): void {
      if (node.nature === 'ARTICLE' || node.type === 'article') {
        articleCount++;
      }
      for (const child of [
        ...(node.sections || []),
        ...(node.articles || []),
        ...(node.enfants || []),
        ...(node.children || []),
      ]) {
        countArticles(child);
      }
    }

    countArticles(data);

    console.log(`   Articles détectés: ${articleCount}`);
    console.log(`   Structure: ${data.sections ? 'sections' : ''} ${data.articles ? 'articles' : ''} ${data.enfants ? 'enfants' : ''}`);
  } else {
    console.log(`   Structure de réponse inattendue`);
    console.log(`   Clés: ${Object.keys(data).join(', ')}`);
  }

  // Afficher un échantillon
  console.log(`\n   Échantillon de réponse:`);
  console.log(`   ${JSON.stringify(data).substring(0, 200)}...`);
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🧪 TEST API LÉGIFRANCE (PISTE)\n');
  console.log('='.repeat(70));

  try {
    // Vérifier les variables d'environnement
    if (!process.env.LEGIFRANCE_CLIENT_ID || !process.env.LEGIFRANCE_CLIENT_SECRET) {
      throw new Error('Variables LEGIFRANCE_CLIENT_ID ou LEGIFRANCE_CLIENT_SECRET manquantes');
    }

    // Étape 1 : OAuth
    const token = await getToken();

    // Étape 2 : Test API
    await testAPI(token);

    console.log('\n' + '='.repeat(70));
    console.log('✅ TOUS LES TESTS PASSENT\n');
    console.log('💡 L\'API Légifrance via PISTE fonctionne correctement.');
    console.log('   Vous pouvez lancer : npx tsx scripts/import-all-codes.ts\n');

  } catch (error: any) {
    console.log('\n' + '='.repeat(70));
    console.error('❌ TEST ÉCHOUÉ\n');
    console.error(`Erreur: ${error.message}\n`);

    console.log('💡 Vérifications à faire :');
    console.log('   1. Variables d\'environnement dans .env.local');
    console.log('   2. Identifiants PISTE valides');
    console.log('   3. Connexion internet\n');

    process.exit(1);
  }
}

// Exécuter
main();
