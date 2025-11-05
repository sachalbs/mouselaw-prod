export type ModeType = 'cas-pratique' | 'dissertation' | 'commentaire';

export interface Mode {
  id: ModeType;
  title: string;
  description: string;
  icon: string;
  color: string;
}

export const MODES: Mode[] = [
  {
    id: 'cas-pratique',
    title: 'Cas Pratique',
    description: 'Résoudre des situations juridiques concrètes avec méthodologie',
    icon: '⚖️',
    color: 'blue',
  },
  {
    id: 'dissertation',
    title: 'Dissertation',
    description: 'Construire une argumentation juridique structurée',
    icon: '📝',
    color: 'purple',
  },
  {
    id: 'commentaire',
    title: 'Commentaire',
    description: 'Analyser un arrêt ou un texte juridique',
    icon: '📚',
    color: 'green',
  },
];

export const getModeById = (id: ModeType): Mode | undefined => {
  return MODES.find((mode) => mode.id === id);
};
