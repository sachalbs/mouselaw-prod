#!/usr/bin/env tsx

/**
 * Import jurisprudence from Judilibre API (PISTE)
 *
 * This script:
 * 1. Authenticates with PISTE OAuth2
 * 2. Fetches essential case law from Judilibre API
 * 3. Transforms to Mouse Law format
 * 4. Saves to data/jurisprudence-api.json
 *
 * Usage:
 *   npx tsx scripts/import-jurisprudence-api.ts          # Full import
 *   npx tsx scripts/import-jurisprudence-api.ts --test   # Test with 10 cases
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { getAccessToken } from '@/lib/legifrance-api';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Parse command line arguments
const args = process.argv.slice(2);
const isTest = args.includes('--test');

const OUTPUT_FILE = path.join(process.cwd(), 'data', 'jurisprudence-api.json');
const JUDILIBRE_API_URL = 'https://api.piste.gouv.fr/cassation/judilibre/v1.0/search';
const RATE_LIMIT_DELAY = 600; // 600ms between requests

interface JudilibreArret {
  id: string;
  numero: string;
  date: string;
  juridiction: string;
  titre: string;
  faits: string;
  solution: string;
  principe: string;
  articles_lies: string[];
  categorie: string;
  importance: 'fondamental' | 'majeur' | 'important' | 'complementaire';
  mots_cles: string[];
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Map chamber code to full juridiction name
 */
function mapChamberToJuridiction(chamber: string): string {
  const chamberMap: Record<string, string> = {
    'civ1': 'Cour de cassation - Chambre civile 1',
    'civ2': 'Cour de cassation - Chambre civile 2',
    'civ3': 'Cour de cassation - Chambre civile 3',
    'comm': 'Cour de cassation - Chambre commerciale',
    'soc': 'Cour de cassation - Chambre sociale',
    'crim': 'Cour de cassation - Chambre criminelle',
  };
  return chamberMap[chamber] || `Cour de cassation - ${chamber}`;
}

/**
 * Extract category from chamber and text
 */
function extractCategorie(chamber: string, text: string): string {
  const lowerText = text.toLowerCase();

  if (chamber === 'soc') return 'travail';
  if (chamber === 'comm') return 'commercial';
  if (chamber === 'crim') return 'penal';

  // Analyze text content
  if (lowerText.includes('responsabilité') || lowerText.includes('dommage')) return 'responsabilite';
  if (lowerText.includes('contrat') || lowerText.includes('obligation')) return 'contrats';
  if (lowerText.includes('mariage') || lowerText.includes('divorce')) return 'famille';
  if (lowerText.includes('propriété') || lowerText.includes('servitude')) return 'propriete';
  if (lowerText.includes('succession') || lowerText.includes('héritage')) return 'successions';
  if (lowerText.includes('vente') || lowerText.includes('acheteur')) return 'vente';

  return 'general';
}

/**
 * Extract principe from sommaire or text
 */
function extractPrincipe(sommaire: string, text: string): string {
  // If sommaire exists, use it as principe
  if (sommaire && sommaire.length > 20) {
    return sommaire.substring(0, 500);
  }

  // Otherwise, try to extract first meaningful sentence
  const sentences = text.split(/[.;]/);
  for (const sentence of sentences) {
    if (sentence.length > 50 && sentence.length < 500) {
      return sentence.trim();
    }
  }

  return text.substring(0, 300);
}

/**
 * Search Judilibre API for essential case law
 */
async function searchJudilibre(
  size: number = 200,
  progressCallback?: (current: number, total: number, message: string) => void
): Promise<JudilibreArret[]> {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║    Fetching Jurisprudence from Judilibre PISTE API      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Prepare authentication
    progressCallback?.(0, 3, 'Authenticating...');
    console.log('🔑 Preparing authentication...\n');

    const keyId = process.env.PISTE_API_KEY;
    let token: string | null = null;

    // Try KeyId first, fallback to OAuth2
    if (!keyId) {
      console.log('   No PISTE_API_KEY found, using OAuth2...');
      token = await getAccessToken();
    } else {
      console.log('   Using PISTE_API_KEY for authentication');
    }

    // Step 2: Search for essential case law with pagination
    progressCallback?.(1, 3, 'Searching Judilibre API...');
    console.log('🔍 Searching for essential case law (publication Bulletin)...\n');

    // Build headers
    const headers: Record<string, string> = {
      'accept': 'application/json',
    };

    if (keyId) {
      headers['KeyId'] = keyId;
    } else if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Pagination: Max 50 results per page
    const pageSize = 50;
    const numPages = Math.ceil(size / pageSize);

    console.log(`   Fetching ${numPages} pages of ${pageSize} results each...\n`);

    const allResults: any[] = [];

    for (let page = 0; page < numPages; page++) {
      try {
        // Build query parameters for this page
        const params = new URLSearchParams({
          query: 'responsabilité OR contrat OR propriété OR succession',
          publication: 'b', // Bulletin = essential cases
          chamber: 'civ1,civ2,civ3,comm,soc', // FIXED: comm with 2 'm'
          page: page.toString(),
          page_size: pageSize.toString(),
          sort: 'date',
          order: 'desc',
        });

        console.log(`   📄 Fetching page ${page + 1}/${numPages}...`);

        const response = await axios.get(
          `${JUDILIBRE_API_URL}?${params.toString()}`,
          {
            headers,
            timeout: 30000,
          }
        );

        console.log(`   ✅ Page ${page + 1}: ${response.data.results?.length || 0} results`);

        if (response.data.results && response.data.results.length > 0) {
          allResults.push(...response.data.results);
        }

        // Rate limiting between pages
        if (page < numPages - 1) {
          await sleep(RATE_LIMIT_DELAY);
        }

      } catch (error: any) {
        console.error(`   ❌ Error fetching page ${page + 1}:`, error.message);
        // Continue with next page
        continue;
      }
    }

    console.log(`\n✅ Total results fetched: ${allResults.length}\n`);

    if (allResults.length === 0) {
      console.log('⚠️  No results found');
      return [];
    }

    // Step 3: Transform to Mouse Law format
    progressCallback?.(2, 3, 'Transforming data...');
    console.log('📝 Transforming to Mouse Law format...\n');

    const arrets: JudilibreArret[] = [];

    for (let i = 0; i < allResults.length; i++) {
      const result = allResults[i];

      try {
        // Extract data from API response
        const id = result.id || `judilibre-${i}`;
        const numero = result.number || result.numeroRegistre || 'N/A';
        const date = result.decision_date || result.date || new Date().toISOString().split('T')[0];
        const chamber = result.chamber?.[0] || result.formation || 'unknown';
        const juridiction = mapChamberToJuridiction(chamber);

        // Extract text content
        const texteIntegral = result.text || result.texte || result.solution || '';
        const sommaire = result.summary || result.sommaire || '';
        const titre = sommaire.substring(0, 200) || `Arrêt n°${numero}`;

        // Try to split faits and solution
        let faits = '';
        let solution = '';

        if (texteIntegral.includes('FAITS') || texteIntegral.includes('Faits')) {
          const parts = texteIntegral.split(/FAITS|Faits/i);
          faits = parts[1]?.split(/MOTIFS|Motifs|PAR CES MOTIFS/i)[0]?.trim() || '';
          solution = texteIntegral;
        } else {
          faits = texteIntegral.substring(0, 500);
          solution = texteIntegral;
        }

        const principe = extractPrincipe(sommaire, texteIntegral);
        const categorie = extractCategorie(chamber, texteIntegral + ' ' + sommaire);

        // Extract articles cited
        const articlesLies: string[] = [];
        const articleMatches = texteIntegral.match(/article[s]?\s+(\d+(?:-\d+)?)/gi);
        if (articleMatches) {
          articleMatches.forEach(match => {
            const num = match.match(/\d+(?:-\d+)?/);
            if (num) articlesLies.push(num[0]);
          });
        }

        // Extract keywords
        const motsClés = result.keywords || [];

        arrets.push({
          id,
          numero,
          date,
          juridiction,
          titre,
          faits: faits || '[À compléter]',
          solution: solution || texteIntegral || '[À compléter]',
          principe,
          articles_lies: [...new Set(articlesLies)], // Remove duplicates
          categorie,
          importance: 'fondamental', // All Bulletin cases are essential
          mots_cles: motsClés,
        });

        // Log progress
        if ((i + 1) % 10 === 0 || i === response.data.results.length - 1) {
          process.stdout.write(`\r   Progress: ${i + 1}/${response.data.results.length} arrêts transformed` + ' '.repeat(20));
        }

      } catch (error) {
        console.error(`\n   ⚠️  Error parsing arrêt ${i}:`, error);
        continue;
      }
    }

    console.log('\n');
    console.log(`✅ Successfully transformed ${arrets.length} arrêts\n`);

    progressCallback?.(3, 3, `Completed - ${arrets.length} arrêts fetched`);

    return arrets;

  } catch (error: any) {
    console.error('\n❌ Error fetching jurisprudence:', error.message);

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }

    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║    Mouse Law - Jurisprudence Import from Judilibre       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Check credentials
    const clientId = process.env.LEGIFRANCE_CLIENT_ID;
    const clientSecret = process.env.LEGIFRANCE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ Missing LEGIFRANCE credentials in .env.local\n');
      console.error('Please add:');
      console.error('   LEGIFRANCE_CLIENT_ID=your_client_id');
      console.error('   LEGIFRANCE_CLIENT_SECRET=your_client_secret\n');
      process.exit(1);
    }

    console.log('✅ Credentials found in .env.local\n');
    console.log('📝 Configuration:');
    console.log(`   Client ID: ${clientId.substring(0, 8)}...`);
    console.log(`   Output file: ${OUTPUT_FILE}`);
    console.log(`   Mode: ${isTest ? 'TEST (10 arrêts)' : 'FULL (200 arrêts)'}\n`);

    // Fetch arrêts
    const size = isTest ? 10 : 200;
    const arrets = await searchJudilibre(size, (current, total, message) => {
      process.stdout.write(`\r   Progress: ${current}/${total} - ${message}` + ' '.repeat(20));
    });

    console.log('\n');

    if (arrets.length === 0) {
      console.log('⚠️  No arrêts found!');
      console.log('   The API may have returned no results.\n');
      return;
    }

    // Save to file
    console.log('💾 Saving arrêts to JSON file...');

    const output = { arrets };

    // Ensure data directory exists
    const dataDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

    // Display results
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                  📊 IMPORT RESULTS                        ');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`   • Total arrêts fetched: ${arrets.length}`);
    console.log(`   • Output file: ${OUTPUT_FILE}`);
    console.log(`   • File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB\n`);

    // Count by category
    const categoryCounts: Record<string, number> = {};
    arrets.forEach(arret => {
      categoryCounts[arret.categorie] = (categoryCounts[arret.categorie] || 0) + 1;
    });

    console.log('   Arrêts by category:');
    Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`      • ${category}: ${count} arrêts`);
      });

    // Count by juridiction
    const juridictionCounts: Record<string, number> = {};
    arrets.forEach(arret => {
      juridictionCounts[arret.juridiction] = (juridictionCounts[arret.juridiction] || 0) + 1;
    });

    console.log('\n   Arrêts by juridiction:');
    Object.entries(juridictionCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([juridiction, count]) => {
        console.log(`      • ${juridiction}: ${count} arrêts`);
      });

    // Show first 3 arrêts for verification
    if (arrets.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('                  🔍 SAMPLE ARRÊTS                         ');
      console.log('═══════════════════════════════════════════════════════════\n');

      arrets.slice(0, 3).forEach((arret, index) => {
        console.log(`${index + 1}. ${arret.juridiction}`);
        console.log(`   Date: ${arret.date}`);
        console.log(`   Numéro: ${arret.numero}`);
        console.log(`   Titre: ${arret.titre.substring(0, 100)}...`);
        console.log(`   Catégorie: ${arret.categorie}`);
        console.log(`   Articles liés: ${arret.articles_lies.join(', ') || 'Aucun'}`);
        console.log(`   Principe: ${arret.principe.substring(0, 150)}...`);
        console.log('');
      });
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🎉 Import complete!\n');
    console.log('Next steps:');
    console.log('   1. Verify the arrêts in the JSON file');
    console.log('   2. Apply Supabase migration: supabase/migrations/add_jurisprudence_table.sql');
    console.log('   3. Run: npx tsx scripts/import-jurisprudence.ts');
    console.log('      (Update to use jurisprudence-api.json)');
    console.log('   4. Generate embeddings for vector search\n');

  } catch (error: any) {
    console.error('\n❌ Error during import:', error.message);

    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Error details:`, error.response.data);
    }

    console.error('\nTroubleshooting:');
    console.error('   1. Verify your credentials are correct');
    console.error('   2. Check that your PISTE application is activated');
    console.error('   3. Ensure you have access to "Judilibre" API');
    console.error('   4. Try again in a few minutes (rate limits)\n');

    process.exit(1);
  }
}

// Run the script
main();
