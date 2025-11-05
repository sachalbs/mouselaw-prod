/**
 * Parser pour les fichiers JSON locaux (data/)
 *
 * Supporte plusieurs formats :
 * - Format API Légifrance (sections, articles, enfants)
 * - Format data.gouv.fr
 * - Format scraped
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface NormalizedArticle {
  article_number: string;
  title: string | null;
  content: string;
  section_path: string | null;
  book: string | null;
  title_section: string | null;
  chapter: string | null;
}

interface ParsingResult {
  articles: NormalizedArticle[];
  format: 'legifrance-api' | 'data-gouv' | 'scraped' | 'unknown';
  source: string;
}

/**
 * Nettoie le texte HTML
 */
function cleanText(html: string): string {
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

/**
 * Parse récursivement la structure Légifrance
 */
function parsLegifranceStructure(
  node: any,
  articles: NormalizedArticle[],
  sectionPath: string[] = [],
  context: any = {}
) {
  const currentContext = { ...context };
  const currentPath = [...sectionPath];

  if (node.titre || node.title) {
    const titre = (node.titre || node.title).toLowerCase();

    if (titre.includes('livre')) {
      currentContext.livre = node.titre || node.title;
      currentPath.push(node.titre || node.title);
    } else if (titre.includes('titre') && !titre.includes('sous-titre')) {
      currentContext.titleSection = node.titre || node.title;
      currentPath.push(node.titre || node.title);
    } else if (titre.includes('chapitre')) {
      currentContext.chapitre = node.titre || node.title;
      currentPath.push(node.titre || node.title);
    } else if (titre.includes('section')) {
      currentContext.section = node.titre || node.title;
      currentPath.push(node.titre || node.title);
    }
  }

  // Si c'est un article
  if (node.nature === 'ARTICLE' || node.type === 'article' || (node.num && node.texte)) {
    const articleNum = node.num || node.article_number || node.numero;
    const texte = node.texte || node.content || node.text || node.bloc_textuel?.texte;

    if (articleNum && texte) {
      articles.push({
        article_number: articleNum,
        title: node.titre || node.title || null,
        content: cleanText(texte),
        section_path: currentPath.length > 0 ? currentPath.join(' > ') : null,
        book: currentContext.livre || null,
        title_section: currentContext.titleSection || null,
        chapter: currentContext.chapitre || null,
      });
    }
  }

  // Parcourir les enfants
  const children = [
    ...(node.sections || []),
    ...(node.articles || []),
    ...(node.enfants || []),
    ...(node.children || []),
  ];

  for (const child of children) {
    parsLegifranceStructure(child, articles, currentPath, currentContext);
  }
}

/**
 * Détecte le format d'un fichier JSON
 */
function detectFormat(data: any): ParsingResult['format'] {
  // Format data.gouv wrapped: { "articles": [ {numero, texte}, ... ] }
  if (data.articles && Array.isArray(data.articles) && data.articles.length > 0 && data.articles[0].numero) {
    return 'data-gouv';
  }

  // Format API Légifrance (structure hiérarchique)
  if (data.sections || data.enfants) {
    return 'legifrance-api';
  }

  // Format data.gouv (tableau d'articles direct)
  if (Array.isArray(data) && data.length > 0 && data[0].numero) {
    return 'data-gouv';
  }

  // Format scraped wrapped: { "articles": [ {article_number, content}, ... ] }
  if (data.articles && Array.isArray(data.articles) && data.articles.length > 0 && data.articles[0].article_number) {
    return 'scraped';
  }

  // Format scraped (tableau direct)
  if (Array.isArray(data) && data.length > 0 && data[0].article_number) {
    return 'scraped';
  }

  return 'unknown';
}

/**
 * Parse le format data.gouv
 */
function parseDataGouvFormat(data: any[]): NormalizedArticle[] {
  return data
    .filter(item => item.numero && item.texte)
    .map(item => ({
      article_number: item.numero,
      title: item.titre || null,
      content: cleanText(item.texte),
      section_path: item.section || null,
      book: item.livre || null,
      title_section: null,
      chapter: item.chapitre || null,
    }));
}

/**
 * Parse le format scraped (déjà normalisé)
 */
function parseScrapedFormat(data: any[]): NormalizedArticle[] {
  return data
    .filter(item => item.article_number && item.content)
    .map(item => ({
      article_number: item.article_number,
      title: item.title || null,
      content: cleanText(item.content),
      section_path: item.section_path || null,
      book: item.book || null,
      title_section: item.title_section || null,
      chapter: item.chapter || null,
    }));
}

/**
 * Charge et parse un fichier JSON local
 */
export function parseLocalJSON(filePath: string): ParsingResult {
  console.log(`\n   📂 Lecture du fichier local: ${filePath}`);

  if (!existsSync(filePath)) {
    throw new Error(`Fichier introuvable: ${filePath}`);
  }

  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    const format = detectFormat(data);
    console.log(`   📋 Format détecté: ${format}`);

    let articles: NormalizedArticle[] = [];

    switch (format) {
      case 'legifrance-api':
        parsLegifranceStructure(data, articles);
        break;

      case 'data-gouv':
        // Unwrap if data is { "articles": [...] }
        const dataGouvArray = Array.isArray(data) ? data : (data.articles || data);
        articles = parseDataGouvFormat(dataGouvArray);
        break;

      case 'scraped':
        // Unwrap if data is { "articles": [...] }
        const scrapedArray = Array.isArray(data) ? data : (data.articles || data);
        articles = parseScrapedFormat(scrapedArray);
        break;

      default:
        throw new Error(`Format JSON non reconnu dans ${filePath}`);
    }

    console.log(`   ✅ ${articles.length} articles parsés`);

    return {
      articles,
      format,
      source: filePath,
    };
  } catch (error: any) {
    console.error(`   ❌ Erreur parsing JSON:`, error.message);
    throw error;
  }
}

/**
 * Trouve automatiquement un fichier JSON pour un code
 */
export function findLocalDataFile(codeName: string): string | null {
  const dataDir = resolve(process.cwd(), 'data');

  // Mapping des noms de codes vers les fichiers
  // Support pour les deux formats: "code_civil" (BDD) et "Code Civil" (ancien format)
  const fileMapping: Record<string, string[]> = {
    'code_civil': [
      'code-civil-api.json',
      'code-civil-complet.json',
      'code-civil-complet-scraped.json',
      'code-civil-data-gouv.json',
    ],
    'Code Civil': [
      'code-civil-api.json',
      'code-civil-complet.json',
      'code-civil-complet-scraped.json',
      'code-civil-data-gouv.json',
    ],
    'code_penal': [
      'code-penal-api.json',
      'code-penal.json',
    ],
    'Code Pénal': [
      'code-penal-api.json',
      'code-penal.json',
    ],
    'code_travail': [
      'code-travail-api.json',
      'code-travail.json',
    ],
    'Code du Travail': [
      'code-travail-api.json',
      'code-travail.json',
    ],
    'code_commerce': [
      'code-commerce-api.json',
      'code-commerce.json',
    ],
    'Code de Commerce': [
      'code-commerce-api.json',
      'code-commerce.json',
    ],
    'code_procedure_civile': [
      'code-procedure-civile-api.json',
      'code-procedure-civile.json',
    ],
    'Code de Procédure Civile': [
      'code-procedure-civile-api.json',
      'code-procedure-civile.json',
    ],
    'code_procedure_penale': [
      'code-procedure-penale-api.json',
      'code-procedure-penale.json',
    ],
    'Code de Procédure Pénale': [
      'code-procedure-penale-api.json',
      'code-procedure-penale.json',
    ],
  };

  const possibleFiles = fileMapping[codeName] || [];

  for (const fileName of possibleFiles) {
    const fullPath = resolve(dataDir, fileName);
    if (existsSync(fullPath)) {
      console.log(`   🎯 Fichier local trouvé: ${fileName}`);
      return fullPath;
    }
  }

  return null;
}

/**
 * Charge les articles depuis les données locales
 */
export function loadLocalArticles(codeName: string): NormalizedArticle[] {
  const filePath = findLocalDataFile(codeName);

  if (!filePath) {
    throw new Error(`Aucun fichier local trouvé pour ${codeName}`);
  }

  const result = parseLocalJSON(filePath);
  return result.articles;
}
