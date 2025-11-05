'use client';

import { useState } from 'react';
import { FileText, Scale, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface BaseSource {
  id: string;
  legifranceUrl: string;
}

interface ArticleSource extends BaseSource {
  type: 'article';
  article_number: string;
  title: string | null;
  content: string;
  category: string | null;
}

interface JurisprudenceSource extends BaseSource {
  type: 'jurisprudence';
  juridiction: string;
  date: string;
  numero: string;
  nom_usuel: string | null;
  titre: string;
  principe: string;
}

type Source = ArticleSource | JurisprudenceSource;

interface SourceCardProps {
  source: Source;
}

export function SourceCard({ source }: SourceCardProps) {
  const [showFull, setShowFull] = useState(false);

  const getTitle = () => {
    if (source.type === 'article') {
      return `Article ${source.article_number}${source.title ? ` - ${source.title}` : ''}`;
    } else {
      return source.nom_usuel || `${source.juridiction} - ${source.date}`;
    }
  };

  const getExcerpt = () => {
    if (source.type === 'article') {
      return source.content.substring(0, 150) + '...';
    } else {
      return source.principe.substring(0, 150) + '...';
    }
  };

  const getFullText = () => {
    if (source.type === 'article') {
      return source.content;
    } else {
      return source.principe;
    }
  };

  const Icon = source.type === 'article' ? FileText : Scale;

  return (
    <div className="border-2 border-slate-200 rounded-xl p-4 bg-gradient-to-br from-blue-50/30 to-slate-50/30 hover:border-blue-300 transition-all duration-200 shadow-sm hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4 className="font-semibold text-sm text-slate-900 mb-1">
            {getTitle()}
          </h4>

          {/* Subtitle for jurisprudence */}
          {source.type === 'jurisprudence' && (
            <p className="text-xs text-slate-600 mb-2">
              {source.titre}
            </p>
          )}

          {/* Content */}
          <p className="text-xs text-slate-700 leading-relaxed mb-3">
            {showFull ? getFullText() : getExcerpt()}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {getFullText().length > 150 && (
              <button
                onClick={() => setShowFull(!showFull)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {showFull ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Voir moins
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Voir plus
                  </>
                )}
              </button>
            )}

            <a
              href={source.legifranceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Voir sur Légifrance
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
