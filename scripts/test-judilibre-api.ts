/**
 * Test rapide de l'API Judilibre
 * Vérifie la connexion et affiche quelques décisions
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const JUDILIBRE_API_URL = 'https://api.piste.gouv.fr/cassation/judilibre/v1.0';

async function getPisteToken(): Promise<string> {
  console.log('🔐 Obtention du token OAuth PISTE...');

  const credentials = Buffer.from(
    `${process.env.LEGIFRANCE_CLIENT_ID}:${process.env.LEGIFRANCE_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://oauth.piste.gouv.fr/api/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=openid',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur OAuth: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log('✅ Token obtenu\n');
  return data.access_token;
}

async function testJudilibreAPI() {
  console.log('🧪 TEST API JUDILIBRE\n');
  console.log('='.repeat(70));

  try {
    const token = await getPisteToken();

    console.log('📤 Test requête API Judilibre...');
    console.log(`   Endpoint: POST ${JUDILIBRE_API_URL}/search`);
    console.log(`   Période: 2024-01-01 → 2024-12-31`);
    console.log(`   Limite: 5 décisions\n`);

    // Body JSON (format correct)
    const requestBody = {
      query: '',
      date_start: '2024-01-01',
      date_end: '2024-12-31',
      sort: 'date',
      order: 'desc',
      page_size: 5,
      page: 0,
    };

    console.log(`   Body: ${JSON.stringify(requestBody, null, 2)}\n`);

    const response = await fetch(`${JUDILIBRE_API_URL}/search`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'KeyId': process.env.LEGIFRANCE_CLIENT_ID!,
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`📥 Réponse: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('\n❌ Erreur API:');
      console.error(errorText.substring(0, 1000));
      return;
    }

    const data = await response.json();

    console.log(`\n✅ Succès !`);
    console.log(`   Total disponible: ${data.total || 0} décisions`);
    console.log(`   Page actuelle: ${data.page || 0}`);
    console.log(`   Récupérées: ${data.results?.length || 0} décisions\n`);

    const decisions = data.results || [];

    if (decisions && decisions.length > 0) {
      console.log('='.repeat(70));
      console.log('📋 ÉCHANTILLON DE DÉCISIONS');
      console.log('='.repeat(70));

      decisions.slice(0, 3).forEach((decision: any, index: number) => {
        const date = decision.decision_date || decision.date || decision.dateDecision;
        const chamber = decision.chamber || decision.chambre || 'N/A';

        console.log(`\n${index + 1}. ${chamber} - ${date ? new Date(date).toLocaleDateString('fr-FR') : 'N/A'}`);
        console.log(`   ID: ${decision.id || decision._id}`);
        console.log(`   Numéro: ${decision.number || decision.numeroRoleGeneral || 'N/A'}`);
        console.log(`   Formation: ${decision.formation || 'N/A'}`);
        console.log(`   Solution: ${decision.solution || decision.typeSolution || 'N/A'}`);

        if (decision.summary || decision.sommaire) {
          const summary = decision.summary || decision.sommaire;
          console.log(`   Résumé: ${summary.substring(0, 150)}...`);
        }

        if (decision.text || decision.texte || decision.texteHtml) {
          const text = decision.text || decision.texte || decision.texteHtml;
          console.log(`   Texte: ${text.substring(0, 200).replace(/\n/g, ' ').replace(/<[^>]+>/g, '')}...`);
        }
      });

      console.log('\n' + '='.repeat(70));
      console.log('✅ API JUDILIBRE FONCTIONNELLE !');
      console.log('='.repeat(70));
      console.log('\n💡 Prêt pour l\'import:');
      console.log('   npx tsx scripts/import-judilibre.ts --limit=100\n');
    }

  } catch (error: any) {
    console.error('\n❌ ERREUR:', error.message);
    console.error('\n📝 Vérifiez:');
    console.error('   1. LEGIFRANCE_CLIENT_ID et LEGIFRANCE_CLIENT_SECRET dans .env.local');
    console.error('   2. Les credentials PISTE sont valides');
    console.error('   3. L\'accès à l\'API Judilibre est activé sur votre compte PISTE\n');
    process.exit(1);
  }
}

testJudilibreAPI();
