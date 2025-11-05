import { BookOpen, Scale, ExternalLink } from 'lucide-react';
import { parseReferences, type Reference } from '@/lib/parseReferences';

interface SourcesSectionProps {
  text: string;
}

/**
 * Composant qui affiche une section "Sources utilisées" en bas d'un message
 * en listant toutes les références trouvées dans le texte
 */
export function SourcesSection({ text }: SourcesSectionProps) {
  const references = parseReferences(text);

  // Dédupliquer les références par texte
  const uniqueRefs = references.reduce((acc, ref) => {
    const key = ref.text.toLowerCase().trim();
    if (!acc.has(key)) {
      acc.set(key, ref);
    }
    return acc;
  }, new Map<string, Reference>());

  const dedupedReferences = Array.from(uniqueRefs.values());

  // Séparer par type
  const articles = dedupedReferences.filter(r => r.type === 'article');
  const jurisprudence = dedupedReferences.filter(r => r.type === 'jurisprudence');

  // Ne rien afficher si pas de références
  if (dedupedReferences.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-blue-50/50 to-slate-50/50 border border-blue-100/50 rounded-xl p-4 space-y-3 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
        <BookOpen className="w-4 h-4 text-blue-600" />
        <span>Sources juridiques</span>
        <span className="ml-auto text-xs font-normal text-slate-500">
          {dedupedReferences.length}{' '}
          {dedupedReferences.length === 1 ? 'référence' : 'références'}
        </span>
      </div>

      {/* Articles */}
      {articles.length > 0 && (
        <div className="space-y-2">
          {articles.map((ref, index) => (
            <SourceItem key={`article-${index}`} reference={ref} />
          ))}
        </div>
      )}

      {/* Jurisprudence */}
      {jurisprudence.length > 0 && (
        <div className="space-y-2">
          {jurisprudence.map((ref, index) => (
            <SourceItem key={`juris-${index}`} reference={ref} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SourceItemProps {
  reference: Reference;
}

function SourceItem({ reference }: SourceItemProps) {
  const getIcon = () => {
    return reference.type === 'article' ? (
      <BookOpen className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
    ) : (
      <Scale className="w-3.5 h-3.5 text-cyan-600 group-hover:scale-110 transition-transform" />
    );
  };

  const getTitle = () => {
    if (reference.type === 'article') {
      const codeLabel = getCodeLabel(reference.codeType);
      return `Article ${reference.articleNumber} - ${codeLabel}`;
    }
    return reference.text;
  };

  const getCodeLabel = (codeType?: string): string => {
    const labels: Record<string, string> = {
      'civil': 'Code civil',
      'penal': 'Code pénal',
      'commerce': 'Code de commerce',
      'procedure_civile': 'Code de procédure civile',
      'procedure_penale': 'Code de procédure pénale',
    };
    return labels[codeType || 'civil'] || 'Code civil';
  };

  const getTypeLabel = () => {
    return reference.type === 'article' ? 'Article de loi' : 'Jurisprudence';
  };

  return (
    <div className="group bg-white rounded-lg p-3.5 border border-slate-200/80 hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/50 transition-all duration-200 hover:-translate-y-0.5">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex-shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-slate-900 mb-1 group-hover:text-blue-700 transition-colors">
            {getTitle()}
          </div>

          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              {getIcon()}
              <span>{getTypeLabel()}</span>
            </div>

            {reference.url && (
              <a
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-all duration-200 hover:underline hover:scale-105"
              >
                <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                Voir sur Légifrance
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
