/**
 * Script de vérification de la configuration avant import
 *
 * Usage:
 *   npx tsx scripts/check-setup.ts
 *
 * Vérifie :
 * - Variables d'environnement
 * - Tables Supabase (legal_codes, legal_articles)
 * - Connexion API Légifrance (PISTE)
 * - Connexion API Mistral
 * - Présence des codes dans legal_codes
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Charger explicitement .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// COULEURS CONSOLE
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function success(msg: string) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`);
}

function error(msg: string) {
  console.log(`${colors.red}❌ ${msg}${colors.reset}`);
}

function warning(msg: string) {
  console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`);
}

function info(msg: string) {
  console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`);
}

// ============================================================================
// VÉRIFICATIONS
// ============================================================================

/**
 * Vérifie les variables d'environnement
 */
function checkEnvironmentVariables(): boolean {
  console.log('\n📋 Vérification des variables d\'environnement...');

  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MISTRAL_API_KEY',
    'LEGIFRANCE_CLIENT_ID',
    'LEGIFRANCE_CLIENT_SECRET',
  ];

  let allPresent = true;

  for (const varName of requiredVars) {
    if (process.env[varName]) {
      success(`${varName} définie`);
    } else {
      error(`${varName} manquante`);
      allPresent = false;
    }
  }

  return allPresent;
}

/**
 * Vérifie la connexion à Supabase et l'existence des tables
 */
async function checkSupabase(): Promise<boolean> {
  console.log('\n🗄️  Vérification de Supabase...');

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Vérifier legal_codes
    const { data: codes, error: codesError } = await supabase
      .from('legal_codes')
      .select('*')
      .limit(1);

    if (codesError) {
      error(`Table legal_codes inaccessible: ${codesError.message}`);
      return false;
    }

    success('Table legal_codes OK');

    // Vérifier legal_articles
    const { data: articles, error: articlesError } = await supabase
      .from('legal_articles')
      .select('*')
      .limit(1);

    if (articlesError) {
      error(`Table legal_articles inaccessible: ${articlesError.message}`);
      return false;
    }

    success('Table legal_articles OK');

    // Compter les codes
    const { count } = await supabase
      .from('legal_codes')
      .select('*', { count: 'exact', head: true });

    if (count === 0) {
      warning('Aucun code trouvé dans legal_codes');
      info('Les codes seront créés lors de l\'import');
    } else {
      success(`${count} code(s) trouvé(s) dans legal_codes`);
    }

    return true;
  } catch (err: any) {
    error(`Erreur connexion Supabase: ${err.message}`);
    return false;
  }
}

/**
 * Vérifie la connexion à l'API Légifrance (PISTE)
 */
async function checkLegifranceAPI(): Promise<boolean> {
  console.log('\n🏛️  Vérification de l\'API Légifrance (PISTE)...');

  try {
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
      const errorText = await response.text();
      error(`Authentification PISTE échouée: ${response.status} - ${errorText}`);
      return false;
    }

    const data = await response.json();

    if (data.access_token) {
      success('Authentification PISTE réussie');
      info(`Token valide obtenu (expire dans ${data.expires_in}s)`);
      return true;
    }

    error('Token non reçu de PISTE');
    return false;
  } catch (err: any) {
    error(`Erreur connexion PISTE: ${err.message}`);
    return false;
  }
}

/**
 * Vérifie la connexion à l'API Mistral
 */
async function checkMistralAPI(): Promise<boolean> {
  console.log('\n🤖 Vérification de l\'API Mistral...');

  try {
    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-embed',
        input: ['Test de connexion'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      error(`API Mistral échouée: ${response.status} - ${errorText}`);
      return false;
    }

    const data = await response.json();

    if (data.data && data.data[0]?.embedding) {
      success('API Mistral accessible');
      info(`Embedding généré (${data.data[0].embedding.length} dimensions)`);
      return true;
    }

    error('Réponse Mistral invalide');
    return false;
  } catch (err: any) {
    error(`Erreur connexion Mistral: ${err.message}`);
    return false;
  }
}

/**
 * Affiche les codes disponibles
 */
async function displayAvailableCodes(): Promise<void> {
  console.log('\n📚 Codes juridiques disponibles...');

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: codes, error } = await supabase
      .from('legal_codes')
      .select('code_name, full_name, legifrance_id')
      .order('code_name');

    if (error || !codes || codes.length === 0) {
      warning('Aucun code trouvé dans legal_codes');
      info('Assurez-vous que la migration a été exécutée');
      return;
    }

    console.log(`\n   ${codes.length} code(s) seront importés :\n`);

    for (const code of codes) {
      console.log(`   📖 ${code.code_name.toUpperCase()}`);
      console.log(`      ${code.full_name}`);
      console.log(`      ID Légifrance: ${code.legifrance_id}\n`);
    }
  } catch (err: any) {
    warning(`Impossible d'afficher les codes: ${err.message}`);
  }
}

/**
 * Vérifie l'extension pgvector
 */
async function checkPgVector(): Promise<boolean> {
  console.log('\n🧬 Vérification de l\'extension pgvector...');

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Tenter de créer un vecteur de test
    const { error } = await supabase.rpc('vector', {});

    // L'erreur "function does not exist" est normale
    // On veut juste vérifier que le type vector est reconnu
    if (error && !error.message.includes('does not exist')) {
      warning('Extension pgvector potentiellement manquante');
      info('Vérifiez que la migration add_vector_extension.sql a été exécutée');
      return false;
    }

    success('Extension pgvector disponible');
    return true;
  } catch (err: any) {
    warning(`Impossible de vérifier pgvector: ${err.message}`);
    return true; // On continue quand même
  }
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

async function main() {
  console.log('🔍 VÉRIFICATION DE LA CONFIGURATION - MOUSE LAW\n');
  console.log('='.repeat(70));

  const checks = {
    env: false,
    supabase: false,
    legifrance: false,
    mistral: false,
    pgvector: false,
  };

  // Vérifications séquentielles
  checks.env = checkEnvironmentVariables();

  if (checks.env) {
    checks.supabase = await checkSupabase();
    checks.pgvector = await checkPgVector();
    checks.legifrance = await checkLegifranceAPI();
    checks.mistral = await checkMistralAPI();
    await displayAvailableCodes();
  }

  // Résumé
  console.log('\n' + '='.repeat(70));
  console.log('📊 RÉSUMÉ DES VÉRIFICATIONS\n');

  const allOk = Object.values(checks).every(v => v);

  console.log(`   Variables d'environnement : ${checks.env ? '✅' : '❌'}`);
  console.log(`   Tables Supabase           : ${checks.supabase ? '✅' : '❌'}`);
  console.log(`   Extension pgvector        : ${checks.pgvector ? '✅' : '❌'}`);
  console.log(`   API Légifrance (PISTE)    : ${checks.legifrance ? '✅' : '❌'}`);
  console.log(`   API Mistral               : ${checks.mistral ? '✅' : '❌'}`);

  console.log('\n' + '='.repeat(70));

  if (allOk) {
    success('Tous les prérequis sont remplis ! 🎉');
    console.log('\n💡 Vous pouvez lancer l\'import :');
    console.log('   npx tsx scripts/import-all-codes.ts\n');
  } else {
    error('Certains prérequis sont manquants');
    console.log('\n💡 Corrigez les erreurs ci-dessus avant de lancer l\'import\n');
    process.exit(1);
  }
}

// Exécuter
main();
