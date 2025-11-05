/**
 * Script d'importation du Code civil depuis data.gouv.fr
 *
 * Usage:
 *   npx tsx scripts/import-civil-code-datagouv.ts
 *
 * Ce script :
 * 1. Télécharge le Code civil depuis data.gouv.fr (format JSON)
 * 2. Les insère dans Supabase (table code_civil_articles)
 * 3. Génère les embeddings avec Mistral AI
 * 4. Met à jour les articles avec leurs embeddings
 *
 * Avantage : Ne nécessite PAS d'identifiants PISTE Légifrance
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Charger explicitement .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const BATCH_SIZE = 100;
const EMBEDDING_DELAY = 2000; // 2 secondes entre chaque batch

// Initialiser Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
 * Télécharge le Code civil depuis data.gouv.fr
 *
 * Source : Base Légifrance ouverte
 * Dataset : https://www.data.gouv.fr/fr/datasets/legi-codes-lois-et-reglements-consolides/
 */
async function fetchCodeCivilFromDataGouv(): Promise<CodeCivilArticle[]> {
  console.log('\n📥 Téléchargement du Code civil depuis data.gouv.fr...');

  try {
    // Pour ce script de démo, on va créer manuellement quelques articles importants
    // En production, vous devriez télécharger le fichier XML complet depuis data.gouv.fr
    // et le parser avec une librairie comme fast-xml-parser

    console.log('⚠️  Mode démo : utilisation d\'articles pré-définis');
    console.log('📚 Pour un import complet, téléchargez le dataset complet depuis :');
    console.log('   https://www.data.gouv.fr/fr/datasets/legi-codes-lois-et-reglements-consolides/');

    const articles: CodeCivilArticle[] = [
      // Livre III - Titre IV - Responsabilité civile
      {
        article_number: '1240',
        title: 'Responsabilité du fait personnel',
        content: 'Tout fait quelconque de l\'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.',
        section: 'Section 1 : Du fait personnel',
        chapter: 'Chapitre II : De la responsabilité civile',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000032041571',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571'
      },
      {
        article_number: '1241',
        title: 'Responsabilité pour négligence ou imprudence',
        content: 'Chacun est responsable du dommage qu\'il a causé non seulement par son fait, mais encore par sa négligence ou par son imprudence.',
        section: 'Section 1 : Du fait personnel',
        chapter: 'Chapitre II : De la responsabilité civile',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000032041575',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041575'
      },
      {
        article_number: '1242',
        title: 'Responsabilité du fait d\'autrui et des choses',
        content: 'On est responsable non seulement du dommage que l\'on cause par son propre fait, mais encore de celui qui est causé par le fait des personnes dont on doit répondre, ou des choses que l\'on a sous sa garde.\n\nToutefois, celui qui détient, à un titre quelconque, tout ou partie de l\'immeuble ou des biens mobiliers dans lesquels un incendie a pris naissance ne sera responsable, vis-à-vis des tiers, des dommages causés par cet incendie que s\'il est prouvé qu\'il doit être attribué à sa faute ou à la faute des personnes dont il est responsable.\n\nCette disposition ne s\'applique pas aux rapports entre propriétaires et locataires, qui demeurent régis par les articles 1733 et 1734 du code civil.',
        section: 'Section 2 : Du fait des personnes dont on doit répondre',
        chapter: 'Chapitre II : De la responsabilité civile',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000032041579',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041579'
      },
      {
        article_number: '1243',
        title: 'Responsabilité du fait des enfants',
        content: 'Le père et la mère, en tant qu\'ils exercent l\'autorité parentale, sont solidairement responsables du dommage causé par leurs enfants mineurs habitant avec eux.',
        section: 'Section 2 : Du fait des personnes dont on doit répondre',
        chapter: 'Chapitre II : De la responsabilité civile',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000006437591',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006437591'
      },
      {
        article_number: '1244',
        title: 'Exonération de responsabilité des parents',
        content: 'Les père et mère ne sont pas responsables du dommage causé par leurs enfants dans les cas suivants :\n\n1° Lorsqu\'ils démontrent avoir exercé une éducation et une surveillance normales et avoir pris toutes les précautions commandées par les circonstances ;\n\n2° Lorsque le fait dommageable a été commis en dehors de toute activité susceptible d\'engager la responsabilité des parents et qu\'il a été commis dans des circonstances telles qu\'aucune surveillance n\'aurait permis de l\'empêcher.',
        section: 'Section 2 : Du fait des personnes dont on doit répondre',
        chapter: 'Chapitre II : De la responsabilité civile',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000032041585',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041585'
      },
      // Droit des contrats
      {
        article_number: '1103',
        title: 'Force obligatoire du contrat',
        content: 'Les contrats légalement formés tiennent lieu de loi à ceux qui les ont faits.',
        section: 'Section 1 : Les dispositions liminaires',
        chapter: 'Chapitre Ier : Dispositions liminaires',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000032040787',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032040787'
      },
      {
        article_number: '1104',
        title: 'Bonne foi contractuelle',
        content: 'Les contrats doivent être négociés, formés et exécutés de bonne foi.\n\nCette disposition est d\'ordre public.',
        section: 'Section 1 : Les dispositions liminaires',
        chapter: 'Chapitre Ier : Dispositions liminaires',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000032040791',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032040791'
      },
      {
        article_number: '1108',
        title: 'Conditions de validité du contrat',
        content: 'Quatre conditions sont essentielles pour la validité d\'une convention :\n\nLe consentement de la partie qui s\'oblige ;\n\nSa capacité de contracter ;\n\nUn objet certain qui forme la matière de l\'engagement ;\n\nUne cause licite dans l\'obligation.',
        section: 'Section 1 : Les dispositions liminaires',
        chapter: 'Chapitre Ier : Dispositions liminaires',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000006436641',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006436641'
      },
      {
        article_number: '1128',
        title: 'Conditions essentielles du contrat',
        content: 'Sont nécessaires à la validité d\'un contrat :\n\n1° Le consentement des parties ;\n\n2° Leur capacité de contracter ;\n\n3° Un contenu licite et certain.',
        section: 'Section 1 : Le consentement',
        chapter: 'Chapitre II : La validité du contrat',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000032040839',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032040839'
      },
      {
        article_number: '1231-1',
        title: 'Exécution du contrat',
        content: 'Le débiteur est condamné, s\'il y a lieu, au paiement de dommages et intérêts soit à raison de l\'inexécution de l\'obligation, soit à raison du retard dans l\'exécution, s\'il ne justifie pas que l\'exécution a été empêchée par la force majeure.',
        section: 'Section 1 : Dispositions générales',
        chapter: 'Chapitre IV : L\'inexécution du contrat',
        book: 'Livre III : Des différentes manières dont on acquiert la propriété',
        legifrance_id: 'LEGIARTI000032041353',
        legifrance_url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041353'
      },
    ];

    console.log(`✅ ${articles.length} articles chargés (mode démo)`);
    return articles;
  } catch (error) {
    console.error('❌ Erreur lors du téléchargement:', error);
    throw error;
  }
}

/**
 * Importe les articles dans Supabase
 */
async function importArticles(articles: CodeCivilArticle[]): Promise<number> {
  console.log('\n💾 Insertion des articles dans Supabase...');

  let inserted = 0;
  const batches = Math.ceil(articles.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, articles.length);
    const batch = articles.slice(start, end);

    const { error } = await supabase
      .from('code_civil_articles')
      .upsert(batch, {
        onConflict: 'article_number',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`❌ Erreur batch ${i + 1}/${batches}:`, error);
      continue;
    }

    inserted += batch.length;
    console.log(`   ✅ Batch ${i + 1}/${batches} - ${batch.length} articles (${inserted}/${articles.length})`);
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
        if (processed % 5 === 0 || processed === articles.length) {
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
  console.log('🚀 Importation du Code civil - Mouse Law (data.gouv.fr)\n');
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

    console.log('✅ Variables d\'environnement OK\n');

    // Étape 1 : Télécharger les articles depuis data.gouv.fr
    const articles = await fetchCodeCivilFromDataGouv();

    // Étape 2 : Insérer dans Supabase
    await importArticles(articles);

    // Étape 3 : Générer les embeddings
    await generateEmbeddings();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Importation terminée avec succès !');
    console.log('\n💡 Note : Ce script utilise un ensemble d\'articles de démo.');
    console.log('   Pour un import complet du Code civil, téléchargez le dataset');
    console.log('   XML depuis data.gouv.fr et adaptez la fonction fetchCodeCivilFromDataGouv()');
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Exécuter le script
main();
