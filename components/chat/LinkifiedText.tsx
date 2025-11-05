import { ExternalLink } from 'lucide-react';
import { textToSegments, type Reference } from '@/lib/parseReferences';

interface LinkifiedTextProps {
  text: string;
  className?: string;
}

/**
 * Composant qui transforme automatiquement les références juridiques en liens cliquables
 */
export function LinkifiedText({ text, className = '' }: LinkifiedTextProps) {
  const segments = textToSegments(text);

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (!segment.isReference || !segment.reference) {
          return <span key={index}>{segment.text}</span>;
        }

        return (
          <ReferenceLink key={index} reference={segment.reference} />
        );
      })}
    </span>
  );
}

interface ReferenceLinkProps {
  reference: Reference;
}

function ReferenceLink({ reference }: ReferenceLinkProps) {
  const getTitle = () => {
    if (reference.type === 'article') {
      const codeLabel = getCodeLabel(reference.codeType);
      return `Consulter l'article ${reference.articleNumber} du ${codeLabel} sur Légifrance`;
    }
    return 'Consulter cette décision';
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

  // Si pas d'URL (jurisprudence sans ID), on affiche juste le texte en surbrillance
  if (!reference.url) {
    return (
      <span
        className="text-blue-700 font-medium bg-gradient-to-r from-blue-50 to-cyan-50 px-1.5 py-0.5 rounded border border-blue-100 shadow-sm"
        title={reference.text}
      >
        {reference.text}
      </span>
    );
  }

  return (
    <a
      href={reference.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1 text-blue-600 hover:text-blue-700 font-medium hover:underline decoration-blue-400 underline-offset-2 transition-all duration-200 group hover:scale-[1.02]"
      title={getTitle()}
    >
      <span>{reference.text}</span>
      <ExternalLink className="inline w-3 h-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
    </a>
  );
}
