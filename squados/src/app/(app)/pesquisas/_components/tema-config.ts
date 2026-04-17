export interface TemaConfig {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const TEMA_CONFIG: Record<string, TemaConfig> = {
  MERCADO: {
    label: 'MERCADO',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-800',
    borderClass: 'border-blue-200',
  },
  COMPETITIVA: {
    label: 'COMPETITIVA',
    bgClass: 'bg-red-100',
    textClass: 'text-red-800',
    borderClass: 'border-red-200',
  },
  TECNICA: {
    label: 'TECNICA',
    bgClass: 'bg-purple-100',
    textClass: 'text-purple-800',
    borderClass: 'border-purple-200',
  },
  MA: {
    label: 'M&A',
    bgClass: 'bg-green-100',
    textClass: 'text-green-800',
    borderClass: 'border-green-200',
  },
  ESTRATEGIA: {
    label: 'ESTRATEGIA',
    bgClass: 'bg-orange-100',
    textClass: 'text-orange-800',
    borderClass: 'border-orange-200',
  },
  REGULATORIA: {
    label: 'REGULATORIA',
    bgClass: 'bg-yellow-100',
    textClass: 'text-yellow-800',
    borderClass: 'border-yellow-200',
  },
  EXPANSAO: {
    label: 'EXPANSAO',
    bgClass: 'bg-cyan-100',
    textClass: 'text-cyan-800',
    borderClass: 'border-cyan-200',
  },
};

export const TEMA_FALLBACK: TemaConfig = {
  label: 'OUTROS',
  bgClass: 'bg-gray-100',
  textClass: 'text-gray-800',
  borderClass: 'border-gray-200',
};

export function extractTema(title: string): string {
  const upper = title.toUpperCase();
  for (const key of Object.keys(TEMA_CONFIG)) {
    if (upper.includes(key)) return key;
  }
  return 'OUTROS';
}

export function getTemaConfig(tema: string): TemaConfig {
  return TEMA_CONFIG[tema] ?? TEMA_FALLBACK;
}
