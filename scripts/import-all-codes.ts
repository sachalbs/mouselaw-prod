/**
 * Script d'importation universel de tous les codes juridiques français
 *
 * Usage:
 *   npx tsx scripts/import-all-codes.ts
 *
 * Ce script :
 * 1. Récupère les codes depuis la table legal_codes
 * 2. Pour chaque code, importe tous les articles depuis l'API Légifrance (PISTE)
 * 3. Insère dans Supabase (table legal_articles)
 * 4. Génère les embeddings avec Mistral AI (mistral-embed, 1024 dimensions)
 * 5. Met à jour les articles avec leurs embeddings
 *
 * Codes importés :
 * - Code Civil
 * - Code Pénal
 * - Code du Travail
 * - Code de Commerce
 * - Code de Procédure Civile
 * - Code de Procédure Pénale
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { importCodeWithFallback, ImportResult } from './import-strategies';
import { NormalizedArticle } from './parsers/local-json-parser';

// Charger explicitement .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const LEGIFRANCE_API_URL = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';
const BATCH_SIZE = 50; // Batch size réduit pour plus de stabilité
const EMBEDDING_DELAY = 2000; // 2 secondes entre chaque batch d'embeddings
const REQUEST_DELAY = 500; // Délai entre les requêtes Légifrance

// Initialiser Supabase avec la clé service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TYPES
// ============================================================================

interface LegalCode {
  id: string;
  code_name: string;
  full_name: string;
  legifrance_id: string;
  description: string | null;
}

interface LegifranceArticle {
  id: string;
  num?: string;
  titre?: string;
  texte?: string;
  section?: string;
  chapitre?: string;
  livre?: string;
  sectionPath?: string[]; // Chemin complet de la section
}

interface LegalArticle {
  code_id: string;
  article_number: string;
  title: string | null;
  content: string;
  section_path: string | null;
  book: string | null;
  title_section: string | null;
  chapter: string | null;
}

// ============================================================================
// AUTHENTIFICATION PISTE
// ============================================================================

/**
 * Obtient un token OAuth depuis l'API PISTE Légifrance
 */
async function getLegifranceToken(): Promise<string> {
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
    throw new Error(`Erreur OAuth PISTE: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log('✅ Token OAuth obtenu');
  return data.access_token;
}

// ============================================================================
// RÉCUPÉRATION DES CODES
// ============================================================================

/**
 * Récupère tous les codes juridiques depuis la table legal_codes
 */
async function fetchLegalCodes(): Promise<LegalCode[]> {
  console.log('\n📚 Récupération des codes juridiques depuis Supabase...');

  const { data, error } = await supabase
    .from('legal_codes')
    .select('*')
    .order('code_name');

  if (error) {
    throw new Error(`Erreur récupération codes: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Aucun code trouvé dans legal_codes. Avez-vous exécuté les migrations ?');
  }

  console.log(`✅ ${data.length} codes trouvés:`);
  data.forEach(code => {
    console.log(`   • ${code.code_name} (${code.legifrance_id})`);
  });

  return data;
}

// ============================================================================
// RÉCUPÉRATION DES ARTICLES
// ============================================================================

/**
 * Récupère tous les articles d'un code depuis Légifrance
 */
async function fetchArticlesFromLegifrance(
  code: LegalCode,
  token: string
): Promise<LegifranceArticle[]> {
  console.log(`\n📥 Récupération des articles du ${code.code_name}...`);

  try {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(`${LEGIFRANCE_API_URL}/consult/code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        textId: code.legifrance_id,
        date: new Date().toISOString().split('T')[0],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API Légifrance: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`   ✅ Réponse reçue de Légifrance`);

    // Parser la structure pour extraire tous les articles
    const articles: LegifranceArticle[] = [];
    parseCodeStructure(data, articles, [], {});

    console.log(`   ✅ ${articles.length} articles extraits`);
    return articles;
  } catch (error) {
    console.error(`   ❌ Erreur lors de la récupération:`, error);
    throw error;
  }
}

/**
 * Parse récursivement la structure du code pour extraire les articles
 * @param node - Nœud actuel de l'arbre
 * @param articles - Tableau accumulateur d'articles
 * @param sectionPath - Chemin de navigation (pour section_path)
 * @param context - Contexte structurel (livre, chapitre, section)
 */
function parseCodeStructure(
  node: any,
  articles: LegifranceArticle[],
  sectionPath: string[] = [],
  context: any = {}
) {
  // Mettre à jour le contexte structurel
  const currentContext = { ...context };
  const currentPath = [...sectionPath];

  if (node.titre) {
    const titre = node.titre.toLowerCase();

    // Détecter le type de section
    if (titre.includes('livre')) {
      currentContext.livre = node.titre;
      currentPath.push(node.titre);
    } else if (titre.includes('titre') && !titre.includes('sous-titre')) {
      currentContext.titleSection = node.titre;
      currentPath.push(node.titre);
    } else if (titre.includes('chapitre')) {
      currentContext.chapitre = node.titre;
      currentPath.push(node.titre);
    } else if (titre.includes('section')) {
      currentContext.section = node.titre;
      currentPath.push(node.titre);
    }
  }

  // Si c'est un article, l'ajouter
  if (node.nature === 'ARTICLE' || node.type === 'article') {
    articles.push({
      id: node.id || node.cid,
      num: node.num,
      titre: node.titre,
      texte: node.texte || node.bloc_textuel?.texte,
      sectionPath: currentPath.length > 0 ? currentPath : undefined,
      ...currentContext,
    });
  }

  // Parcourir récursivement les enfants
  const children = [
    ...(node.sections || []),
    ...(node.articles || []),
    ...(node.enfants || []),
    ...(node.children || []),
  ];

  for (const child of children) {
    parseCodeStructure(child, articles, currentPath, currentContext);
  }
}

/**
 * Nettoie le texte HTML des articles
 */
function cleanArticleText(html: string): string {
  if (!html) return '';

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================================
// IMPORTATION DANS SUPABASE
// ============================================================================

/**
 * Importe les articles d'un code dans Supabase (table legal_articles)
 */
async function importArticles(
  code: LegalCode,
  articles: LegifranceArticle[]
): Promise<number> {
  console.log(`\n💾 Insertion des articles dans legal_articles...`);

  let inserted = 0;
  const batches = Math.ceil(articles.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, articles.length);
    const batch = articles.slice(start, end);

    // Transformer en format legal_articles
    const records: LegalArticle[] = batch
      .filter(a => a.num && a.texte) // Ne garder que les articles valides
      .map(article => ({
        code_id: code.id,
        article_number: article.num!,
        title: article.titre || null,
        content: cleanArticleText(article.texte!),
        section_path: article.sectionPath ? article.sectionPath.join(' > ') : null,
        book: article.livre || null,
        title_section: article.titleSection || null,
        chapter: article.chapitre || null,
      }));

    if (records.length === 0) continue;

    // UPSERT avec conflit sur (code_id, article_number)
    const { error } = await supabase
      .from('legal_articles')
      .upsert(records, {
        onConflict: 'code_id,article_number',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`   ❌ Erreur batch ${i + 1}/${batches}:`, error.message);
      continue;
    }

    inserted += records.length;
    console.log(`   ✅ Batch ${i + 1}/${batches} - ${records.length} articles (${inserted}/${articles.length})`);

    // Petite pause pour éviter le rate limit
    if (i < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`   ✅ ${inserted} articles insérés/mis à jour`);
  return inserted;
}

/**
 * Importe les articles normalisés (depuis le système de fallback) dans Supabase
 */
async function importArticlesNormalized(
  code: LegalCode,
  articles: NormalizedArticle[]
): Promise<number> {
  console.log(`\n💾 Insertion des articles dans legal_articles...`);

  let inserted = 0;
  const batches = Math.ceil(articles.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, articles.length);
    const batch = articles.slice(start, end);

    // Transformer en format legal_articles
    const records: LegalArticle[] = batch
      .filter(a => a.article_number && a.content) // Ne garder que les articles valides
      .map(article => ({
        code_id: code.id,
        article_number: article.article_number,
        title: article.title || null,
        content: article.content, // Déjà nettoyé par le parser
        section_path: article.section_path || null,
        book: article.book || null,
        title_section: article.title_section || null,
        chapter: article.chapter || null,
      }));

    if (records.length === 0) continue;

    // UPSERT avec conflit sur (code_id, article_number)
    const { error } = await supabase
      .from('legal_articles')
      .upsert(records, {
        onConflict: 'code_id,article_number',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`   ❌ Erreur batch ${i + 1}/${batches}:`, error.message);
      continue;
    }

    inserted += records.length;
    console.log(`   ✅ Batch ${i + 1}/${batches} - ${records.length} articles (${inserted}/${articles.length})`);

    // Petite pause pour éviter le rate limit
    if (i < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`   ✅ ${inserted} articles insérés/mis à jour`);
  return inserted;
}

// ============================================================================
// GÉNÉRATION DES EMBEDDINGS
// ============================================================================

/**
 * Génère un embedding avec Mistral AI (mistral-embed, 1024 dimensions)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-embed',
      input: [text],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur Mistral API: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Génère les embeddings pour les articles d'un code
 */
async function generateEmbeddingsForCode(code: LegalCode): Promise<void> {
  console.log(`\n🧠 Génération des embeddings pour ${code.code_name}...`);

  // Compter les articles sans embeddings
  const { data: articles, error } = await supabase
    .from('legal_articles')
    .select('id, article_number, title, content')
    .eq('code_id', code.id)
    .is('embedding', null)
    .order('article_number');

  if (error) {
    console.error(`   ❌ Erreur récupération articles:`, error.message);
    return;
  }

  if (!articles || articles.length === 0) {
    console.log(`   ✅ Tous les articles ont déjà des embeddings !`);
    return;
  }

  console.log(`   🎯 ${articles.length} articles à traiter`);

  let processed = 0;
  const batches = Math.ceil(articles.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, articles.length);
    const batch = articles.slice(start, end);

    console.log(`\n   📦 Batch ${i + 1}/${batches} (${batch.length} articles)...`);

    for (const article of batch) {
      try {
        // Créer le texte pour l'embedding (riche en contexte)
        const textForEmbedding = `${code.code_name} - Article ${article.article_number}${
          article.title ? ` - ${article.title}` : ''
        }\n\n${article.content}`;

        // Générer l'embedding
        const embedding = await generateEmbedding(textForEmbedding);

        // Mettre à jour dans Supabase
        const { error: updateError } = await supabase
          .from('legal_articles')
          .update({ embedding })
          .eq('id', article.id);

        if (updateError) {
          console.error(`      ❌ Erreur update article ${article.article_number}:`, updateError.message);
          continue;
        }

        processed++;
        if (processed % 10 === 0) {
          console.log(`      ⏳ ${processed}/${articles.length} traités...`);
        }

        // Petit délai pour éviter le rate limit Mistral
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        console.error(`      ❌ Erreur article ${article.article_number}:`, error.message);
      }
    }

    // Pause entre les batches
    if (i < batches - 1) {
      console.log(`      ⏸️  Pause de ${EMBEDDING_DELAY / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, EMBEDDING_DELAY));
    }
  }

  console.log(`   ✅ ${processed} embeddings générés avec succès`);
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

/**
 * Traite un code complet (récupération + import + embeddings)
 * Utilise le système de fallback en cascade
 */
async function processCode(code: LegalCode, token: string): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log(`📖 TRAITEMENT : ${code.full_name}`);
  console.log('='.repeat(70));

  try {
    // Étape 1 : Récupérer avec système de fallback en cascade
    const result = await importCodeWithFallback(code, token);

    if (!result.success || result.articles.length === 0) {
      console.error(`\n❌ Impossible de récupérer ${code.code_name} - toutes les sources ont échoué`);
      console.error(`   Erreur: ${result.error}`);
      return;
    }

    console.log(`\n✅ Source utilisée: ${result.source}`);
    console.log(`   Articles récupérés: ${result.articles.length}`);

    // Étape 2 : Insérer dans Supabase
    await importArticlesNormalized(code, result.articles);

    // Étape 3 : Générer les embeddings
    await generateEmbeddingsForCode(code);

    console.log(`\n✅ ${code.code_name} traité avec succès !`);
  } catch (error: any) {
    console.error(`\n❌ Erreur traitement ${code.code_name}:`, error.message);
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 IMPORTATION UNIVERSELLE DES CODES JURIDIQUES - MOUSE LAW\n');
  console.log('='.repeat(70));

  try {
    // Vérifier les variables d'environnement
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'MISTRAL_API_KEY',
      'LEGIFRANCE_CLIENT_ID',
      'LEGIFRANCE_CLIENT_SECRET',
    ];

    for (const varName of requiredEnvVars) {
      if (!process.env[varName]) {
        throw new Error(`Variable d'environnement manquante: ${varName}`);
      }
    }

    console.log('✅ Variables d\'environnement OK\n');

    // Récupérer les codes depuis Supabase
    const codes = await fetchLegalCodes();

    // Obtenir le token OAuth (valide pour tous les codes)
    const token = await getLegifranceToken();

    // Traiter chaque code
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      console.log(`\n[${i + 1}/${codes.length}] Traitement de ${code.code_name}...`);

      await processCode(code, token);

      // Pause entre les codes
      if (i < codes.length - 1) {
        console.log(`\n⏸️  Pause de ${REQUEST_DELAY / 1000}s avant le prochain code...`);
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
      }
    }

    // Résumé final
    console.log('\n' + '='.repeat(70));
    console.log('🎉 IMPORTATION TERMINÉE AVEC SUCCÈS !');
    console.log('='.repeat(70));

    // Afficher les statistiques finales
    const { count: totalArticles } = await supabase
      .from('legal_articles')
      .select('*', { count: 'exact', head: true });

    const { count: withEmbeddings } = await supabase
      .from('legal_articles')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    console.log(`\n📊 STATISTIQUES FINALES :`);
    console.log(`   • Total d'articles : ${totalArticles}`);
    console.log(`   • Articles avec embeddings : ${withEmbeddings}`);
    console.log(`   • Pourcentage : ${((withEmbeddings! / totalArticles!) * 100).toFixed(1)}%`);
    console.log('\n💡 Exécutez "npx tsx scripts/check-import-progress.ts" pour plus de détails.\n');

  } catch (error: any) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    process.exit(1);
  }
}

// Exécuter le script
main();
