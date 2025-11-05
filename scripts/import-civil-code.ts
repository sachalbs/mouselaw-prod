/**
 * Script d'importation du Code civil depuis Légifrance
 *
 * Usage:
 *   npx tsx scripts/import-civil-code.ts
 *
 * Ce script :
 * 1. Importe les articles du Code civil depuis l'API Légifrance
 * 2. Les insère dans Supabase (table code_civil_articles)
 * 3. Génère les embeddings avec Mistral AI
 * 4. Met à jour les articles avec leurs embeddings
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Charger explicitement .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const LEGIFRANCE_API_URL = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';
const CODE_CIVIL_ID = 'LEGITEXT000006070721';
const BATCH_SIZE = 100;
const EMBEDDING_DELAY = 2000; // 2 secondes entre chaque batch

// Initialiser Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LegifranceArticle {
  id: string;
  num?: string;
  titre?: string;
  texte?: string;
  section?: string;
  chapitre?: string;
  livre?: string;
}

interface CodeCivilArticle {
  article_number: string;
  title: string | null;
  content: string;
  section: string | null;
  chapter: string | null;
  book: string | null;
  legifrance_id: string;
  legifrance_url: string;
}

/**
 * Obtient un token OAuth depuis l'API Légifrance
 */
async function getLegifranceToken(): Promise<string> {
  console.log('🔐 Obtention du token OAuth Légifrance...');

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
    throw new Error(`Erreur OAuth Légifrance: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log('✅ Token OAuth obtenu');
  return data.access_token;
}

/**
 * Récupère les articles du Code civil depuis Légifrance
 */
async function fetchArticlesFromLegifrance(): Promise<LegifranceArticle[]> {
  console.log('\n📥 Récupération des articles depuis Légifrance...');

  try {
    // Obtenir le token OAuth
    const token = await getLegifranceToken();

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(`${LEGIFRANCE_API_URL}/consult/code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        textId: CODE_CIVIL_ID,
        date: new Date().toISOString().split('T')[0],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur Légifrance API: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`✅ Données reçues de Légifrance`);

    // Parser la structure pour extraire tous les articles
    const articles: LegifranceArticle[] = [];
    parseCodeStructure(data, articles);

    console.log(`✅ ${articles.length} articles extraits`);
    return articles;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération depuis Légifrance:', error);
    throw error;
  }
}

/**
 * Parse récursivement la structure du code pour extraire les articles
 */
function parseCodeStructure(node: any, articles: LegifranceArticle[], context: any = {}) {
  // Mettre à jour le contexte (livre, chapitre, section)
  const currentContext = { ...context };

  if (node.titre) {
    const titre = node.titre.toLowerCase();
    if (titre.includes('livre')) currentContext.livre = node.titre;
    else if (titre.includes('chapitre')) currentContext.chapitre = node.titre;
    else if (titre.includes('section')) currentContext.section = node.titre;
  }

  // Si c'est un article, l'ajouter
  if (node.nature === 'ARTICLE' || node.type === 'article') {
    articles.push({
      id: node.id || node.cid,
      num: node.num,
      titre: node.titre,
      texte: node.texte || node.bloc_textuel?.texte,
      ...currentContext,
    });
  }

  // Parcourir récursivement les enfants
  if (node.sections) {
    for (const section of node.sections) {
      parseCodeStructure(section, articles, currentContext);
    }
  }
  if (node.articles) {
    for (const article of node.articles) {
      parseCodeStructure(article, articles, currentContext);
    }
  }
  if (node.enfants || node.children) {
    for (const child of node.enfants || node.children) {
      parseCodeStructure(child, articles, currentContext);
    }
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
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Importe les articles dans Supabase
 */
async function importArticles(articles: LegifranceArticle[]): Promise<number> {
  console.log('\n💾 Insertion des articles dans Supabase...');

  let inserted = 0;
  const batches = Math.ceil(articles.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, articles.length);
    const batch = articles.slice(start, end);

    const records: CodeCivilArticle[] = batch
      .filter(a => a.num && a.texte) // Ne garder que les articles avec numéro et texte
      .map(article => ({
        article_number: article.num!,
        title: article.titre || null,
        content: cleanArticleText(article.texte!),
        section: article.section || null,
        chapter: article.chapitre || null,
        book: article.livre || null,
        legifrance_id: article.id,
        legifrance_url: `https://www.legifrance.gouv.fr/codes/article_lc/${article.id}`,
      }));

    if (records.length === 0) continue;

    const { error } = await supabase
      .from('code_civil_articles')
      .upsert(records, {
        onConflict: 'article_number',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`❌ Erreur batch ${i + 1}/${batches}:`, error);
      continue;
    }

    inserted += records.length;
    console.log(`   ✅ Batch ${i + 1}/${batches} - ${records.length} articles (${inserted}/${articles.length})`);
  }

  console.log(`\n✅ ${inserted} articles insérés avec succès`);
  return inserted;
}

/**
 * Génère un embedding avec Mistral AI
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
 * Génère les embeddings pour tous les articles
 */
async function generateEmbeddings(): Promise<void> {
  console.log('\n🧠 Génération des embeddings...');

  // Compter combien d'articles ont déjà des embeddings
  const { count: totalCount } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true });

  const { count: withEmbeddings } = await supabase
    .from('code_civil_articles')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  console.log(`📊 État actuel: ${withEmbeddings}/${totalCount} articles avec embeddings`);

  // Récupérer les articles sans embeddings
  const { data: articles, error } = await supabase
    .from('code_civil_articles')
    .select('id, article_number, title, content')
    .is('embedding', null)
    .order('article_number');

  if (error) {
    console.error('❌ Erreur récupération articles:', error);
    return;
  }

  if (!articles || articles.length === 0) {
    console.log('✅ Tous les articles ont déjà des embeddings !');
    return;
  }

  console.log(`🎯 ${articles.length} articles à traiter`);

  let processed = 0;
  const batches = Math.ceil(articles.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, articles.length);
    const batch = articles.slice(start, end);

    console.log(`\n📦 Batch ${i + 1}/${batches} (${batch.length} articles)...`);

    for (const article of batch) {
      try {
        // Créer le texte pour l'embedding
        const textForEmbedding = `Article ${article.article_number}${article.title ? ` - ${article.title}` : ''}\n\n${article.content}`;

        // Générer l'embedding
        const embedding = await generateEmbedding(textForEmbedding);

        // Mettre à jour dans Supabase
        const { error: updateError } = await supabase
          .from('code_civil_articles')
          .update({ embedding })
          .eq('id', article.id);

        if (updateError) {
          console.error(`   ❌ Erreur update article ${article.article_number}:`, updateError);
          continue;
        }

        processed++;
        if (processed % 10 === 0) {
          console.log(`   ⏳ ${processed}/${articles.length} traités...`);
        }
      } catch (error) {
        console.error(`   ❌ Erreur article ${article.article_number}:`, error);
      }
    }

    // Pause entre les batches pour éviter le rate limit
    if (i < batches - 1) {
      console.log(`   ⏸️  Pause de ${EMBEDDING_DELAY / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, EMBEDDING_DELAY));
    }
  }

  console.log(`\n✅ ${processed} embeddings générés avec succès`);
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 Importation du Code civil - Mouse Law\n');
  console.log('='.repeat(60));

  try {
    // Vérifier les variables d'environnement
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL manquante');
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante');
    }
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY manquante');
    }
    if (!process.env.LEGIFRANCE_CLIENT_ID || !process.env.LEGIFRANCE_CLIENT_SECRET) {
      throw new Error('Identifiants Légifrance manquants');
    }

    console.log('✅ Variables d\'environnement OK\n');

    // Étape 1 : Récupérer les articles depuis Légifrance
    const articles = await fetchArticlesFromLegifrance();

    // Étape 2 : Insérer dans Supabase
    await importArticles(articles);

    // Étape 3 : Générer les embeddings
    await generateEmbeddings();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Importation terminée avec succès !');
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Exécuter le script
main();
