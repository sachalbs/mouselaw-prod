import { MODES, ModeType } from '@/lib/constants/modes';
import { Scale, FileText, BookMarked } from 'lucide-react';

interface ModeSelectorProps {
  selectedMode: ModeType;
  onModeChange: (mode: ModeType) => void;
}

function getModeIcon(modeId: ModeType, className?: string) {
  switch (modeId) {
    case 'cas-pratique':
      return <Scale className={className} />;
    case 'dissertation':
      return <FileText className={className} />;
    case 'commentaire':
      return <BookMarked className={className} />;
    default:
      return <Scale className={className} />;
  }
}

export function ModeSelector({
  selectedMode,
  onModeChange,
}: ModeSelectorProps) {
  return (
    <div className="inline-flex p-1.5 bg-slate-100 rounded-xl gap-1.5 backdrop-blur-sm border border-slate-200/50 shadow-sm">
      {MODES.map((mode) => {
        const isSelected = selectedMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            className={`
              relative flex items-center gap-3 px-5 py-3 rounded-lg
              font-medium text-sm transition-all duration-200
              ${
                isSelected
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }
            `}
          >
            {/* Icon */}
            <div
              className={`transition-all duration-200 ${
                isSelected ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              {getModeIcon(mode.id, 'w-4.5 h-4.5')}
            </div>

            {/* Content */}
            <div className="text-left">
              <div className="font-semibold leading-tight">{mode.title}</div>
              <div
                className={`text-xs font-normal leading-tight mt-1 transition-colors ${
                  isSelected ? 'text-slate-600' : 'text-slate-500'
                }`}
              >
                {mode.description.split(' ').slice(0, 4).join(' ')}...
              </div>
            </div>

            {/* Active indicator */}
            {isSelected && (
              <div className="absolute inset-0 rounded-lg ring-2 ring-blue-500/15" />
            )}
          </button>
        );
      })}
    </div>
  );
}
