/**
 * Utilitaire pour détecter et parser les références juridiques dans le texte
 */

export interface Reference {
  type: 'article' | 'jurisprudence';
  text: string; // Texte original trouvé
  start: number; // Position de début dans le texte
  end: number; // Position de fin dans le texte
  articleNumber?: string; // Pour les articles
  codeType?: string; // "civil", "pénal", etc.
  url?: string; // URL Légifrance
}

/**
 * Patterns regex pour détecter les références
 */
const PATTERNS = {
  // Articles : "Article 1128", "art. 1128", "Art. 1128 du Code civil"
  article: /(?:Article|Art\.|art\.|article)\s+(\d+(?:-\d+)?(?:\s+(?:et|à)\s+\d+(?:-\d+)?)?)\s*(?:du\s+Code\s+(civil|pénal|de\s+commerce|de\s+procédure\s+civile|de\s+procédure\s+pénale))?/gi,

  // Jurisprudence : détection flexible pour différents formats
  // Exemples couverts :
  // - "Cass. Civ. 1, 15 oct. 2024, n° 23-19876"
  // - "Cour de cassation, 13/02/1930"
  // - "Cour de Cassation, 15 octobre 2024"
  // - "Cour de Cassation - 15/11/2024, n° 23-15432" (trait d'union)
  // - "CA Paris, 5 mars 2024"
  jurisprudence: /(?:Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)(?:\s+(?:Civ\.|Comm\.|Soc\.|Crim\.|Ch\.\s+mixte)\s*\d*)?[\s,\-]+(?:\d{1,2}[\s/\-](?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\.|févr\.|avr\.|juil\.|sept\.|oct\.|nov\.|déc\.)\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})(?:[\s,]*n°?\s*[\d\-]+)?/gi,
};

/**
 * Parse le texte pour trouver toutes les références
 */
export function parseReferences(text: string): Reference[] {
  const references: Reference[] = [];

  // Rechercher les articles
  let match;
  const articleRegex = new RegExp(PATTERNS.article);
  while ((match = articleRegex.exec(text)) !== null) {
    const articleNumber = match[1];
    const codeType = match[2] || 'civil'; // Par défaut Code civil

    references.push({
      type: 'article',
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      articleNumber,
      codeType: normalizeCodeType(codeType),
      url: generateLegifranceUrl(articleNumber, codeType),
    });
  }

  // Rechercher la jurisprudence
  const jurisRegex = new RegExp(PATTERNS.jurisprudence);
  while ((match = jurisRegex.exec(text)) !== null) {
    const jurisText = match[0];

    references.push({
      type: 'jurisprudence',
      text: jurisText,
      start: match.index,
      end: match.index + match[0].length,
      url: generateJurisprudenceUrl(jurisText),
    });
  }

  // Trier par position dans le texte
  return references.sort((a, b) => a.start - b.start);
}

/**
 * Normalise le type de code
 */
function normalizeCodeType(codeType: string): string {
  const normalized = codeType.toLowerCase().trim();
  if (normalized.includes('civil')) return 'civil';
  if (normalized.includes('pénal')) return 'penal';
  if (normalized.includes('commerce')) return 'commerce';
  if (normalized.includes('procédure civile')) return 'procedure_civile';
  if (normalized.includes('procédure pénale')) return 'procedure_penale';
  return 'civil';
}

/**
 * Génère l'URL Légifrance pour un article
 * Utilise l'URL de recherche qui redirige automatiquement vers l'article
 */
function generateLegifranceUrl(articleNumber: string, codeType?: string): string {
  const codeNames: Record<string, string> = {
    'civil': 'code civil',
    'penal': 'code pénal',
    'commerce': 'code de commerce',
    'procedure_civile': 'code de procédure civile',
    'procedure_penale': 'code de procédure pénale',
  };

  const normalizedCodeType = normalizeCodeType(codeType || 'civil');
  const codeName = codeNames[normalizedCodeType] || 'code civil';

  // Nettoyer le numéro d'article (enlever les "et", "à", etc.)
  const cleanArticleNumber = articleNumber.split(/\s+(?:et|à)\s+/)[0].trim();

  // URL de recherche Légifrance - sera redirigée vers l'article exact
  // Format: recherche "article X" dans le code spécifique
  const searchQuery = encodeURIComponent(`article ${cleanArticleNumber} ${codeName}`);
  return `https://www.legifrance.gouv.fr/search/code?tab_selection=code&searchField=ALL&query=${searchQuery}&page=1&init=true`;
}

/**
 * Génère l'URL Légifrance pour une décision de jurisprudence
 * Utilise l'URL de recherche pour trouver la décision
 */
function generateJurisprudenceUrl(jurisText: string): string {
  // Extraire le numéro de décision si présent
  const numeroMatch = jurisText.match(/n°?\s*([\d-]+)/i);
  const numero = numeroMatch ? numeroMatch[1] : null;

  // Extraire la date
  const dateMatch = jurisText.match(/(\d{1,2}[\s/](?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\.|févr\.|avr\.|juil\.|sept\.|oct\.|nov\.|déc\.|[\d]{1,2}[\s/])(?:\s|\/)?\d{4})/i);
  const date = dateMatch ? dateMatch[1] : null;

  // Extraire la juridiction (Cass., CA, etc.)
  const juridictionMatch = jurisText.match(/^(Cass\.|Cour\s+de\s+[Cc]assation|CA\s+\w+|Cour\s+d'appel)/i);
  const juridiction = juridictionMatch ? juridictionMatch[1] : null;

  // Construire la requête de recherche
  let searchTerms: string[] = [];

  if (juridiction) {
    // Normaliser la juridiction
    if (juridiction.toLowerCase().includes('cass')) {
      searchTerms.push('Cour de cassation');
    } else {
      searchTerms.push(juridiction);
    }
  }

  if (date) {
    // Nettoyer et normaliser la date
    searchTerms.push(date.replace(/[\s/]+/g, ' '));
  }

  if (numero) {
    searchTerms.push(numero);
  }

  // Si aucun terme spécifique n'a été extrait, utiliser tout le texte
  if (searchTerms.length === 0) {
    searchTerms.push(jurisText);
  }

  // URL de recherche Légifrance dans la section Jurisprudence
  const searchQuery = encodeURIComponent(searchTerms.join(' '));
  return `https://www.legifrance.gouv.fr/search/juri?tab_selection=juri&searchField=ALL&query=${searchQuery}&page=1&init=true&dateDecision=ALL`;
}

/**
 * Convertit un texte en segments avec références marquées
 */
export interface TextSegment {
  text: string;
  isReference: boolean;
  reference?: Reference;
}

export function textToSegments(text: string): TextSegment[] {
  const references = parseReferences(text);
  const segments: TextSegment[] = [];

  let lastIndex = 0;

  references.forEach(ref => {
    // Texte avant la référence
    if (ref.start > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, ref.start),
        isReference: false,
      });
    }

    // La référence elle-même
    segments.push({
      text: ref.text,
      isReference: true,
      reference: ref,
    });

    lastIndex = ref.end;
  });

  // Texte après la dernière référence
  if (lastIndex < text.length) {
    segments.push({
      text: text.substring(lastIndex),
      isReference: false,
    });
  }

  return segments;
}
