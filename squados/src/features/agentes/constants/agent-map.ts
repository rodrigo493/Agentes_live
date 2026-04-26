export const AGENT_MAP: Record<string, { emoji: string; nome: string; role: 'LEAD' | 'SPC' | 'INT'; cor: string }> = {
  'laivinha':    { emoji: '🍀', nome: 'Laivinha',  role: 'LEAD', cor: '#22c55e' },
  'orquestradora':{ emoji: '🍀', nome: 'Laivinha', role: 'LEAD', cor: '#22c55e' },
  'pesquisa':    { emoji: '🔍', nome: 'Fury',      role: 'SPC',  cor: '#3b82f6' },
  'redator':     { emoji: '✍️',  nome: 'Loki',      role: 'SPC',  cor: '#8b5cf6' },
  'comercial':   { emoji: '💼', nome: 'Pepper',    role: 'SPC',  cor: '#f97316' },
  'produto':     { emoji: '📦', nome: 'Shuri',     role: 'SPC',  cor: '#06b6d4' },
  'financeiro':  { emoji: '📊', nome: 'Vision',    role: 'SPC',  cor: '#eab308' },
  'marketing':   { emoji: '📣', nome: 'Quill',     role: 'SPC',  cor: '#ec4899' },
  'operações':   { emoji: '🏭', nome: 'Friday',    role: 'SPC',  cor: '#14b8a6' },
  'operacoes':   { emoji: '🏭', nome: 'Friday',    role: 'SPC',  cor: '#14b8a6' },
  'dados':       { emoji: '🗄️', nome: 'Wong',      role: 'SPC',  cor: '#a855f7' },
  'p&d':         { emoji: '🔬', nome: 'Edison',    role: 'LEAD', cor: '#f43f5e' },
  'pesquisa e':  { emoji: '🔬', nome: 'Edison',    role: 'LEAD', cor: '#f43f5e' },
};

export function resolveAgent(nome: string, papel: string): {
  emoji: string;
  displayName: string;
  role: 'LEAD' | 'SPC' | 'INT';
  cor: string;
} {
  const search = (nome + ' ' + papel).toLowerCase();
  for (const [key, val] of Object.entries(AGENT_MAP)) {
    if (search.includes(key)) {
      return { emoji: val.emoji, displayName: val.nome, role: val.role, cor: val.cor };
    }
  }
  const first = nome.split(' ')[0];
  return { emoji: '🤖', displayName: first, role: 'INT', cor: '#64748b' };
}
