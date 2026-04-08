export interface SectorSeed {
  name: string;
  slug: string;
  area: string;
  description: string;
  icon: string;
}

export const INITIAL_SECTORS: SectorSeed[] = [
  { name: 'Solda', slug: 'solda', area: 'Produção', description: 'Setor de soldagem', icon: '🔥' },
  { name: 'Inspeção de Qualidade - Solda', slug: 'inspecao_qualidade_solda', area: 'Qualidade', description: 'Inspeção e controle de qualidade da solda', icon: '🔍' },
  { name: 'Lavagem', slug: 'lavagem', area: 'Produção', description: 'Setor de lavagem de peças', icon: '💧' },
  { name: 'Pintura', slug: 'pintura', area: 'Produção', description: 'Setor de pintura', icon: '🎨' },
  { name: 'Inspeção de Qualidade - Pintura', slug: 'inspecao_qualidade_pintura', area: 'Qualidade', description: 'Inspeção e controle de qualidade da pintura', icon: '🔎' },
  { name: 'Montagem', slug: 'montagem', area: 'Produção', description: 'Setor de montagem final', icon: '🔧' },
  { name: 'Expedição', slug: 'expedicao', area: 'Logística', description: 'Setor de expedição e logística', icon: '📦' },
  { name: 'Compras', slug: 'compras', area: 'Suprimentos', description: 'Setor de compras e suprimentos', icon: '🛒' },
  { name: 'Comercial', slug: 'comercial', area: 'Comercial', description: 'Setor comercial e vendas', icon: '💼' },
  { name: 'Marketing', slug: 'marketing', area: 'Marketing', description: 'Setor de marketing e comunicação', icon: '📢' },
  { name: 'Financeiro', slug: 'financeiro', area: 'Financeiro', description: 'Setor financeiro', icon: '💰' },
  { name: 'Contábil', slug: 'contabil', area: 'Financeiro', description: 'Setor de contabilidade', icon: '📊' },
  { name: 'Administrativo', slug: 'administrativo', area: 'Administrativo', description: 'Setor administrativo', icon: '🏢' },
  { name: 'RH', slug: 'rh', area: 'RH', description: 'Recursos humanos', icon: '👥' },
  { name: 'Pós-venda', slug: 'pos_venda', area: 'Pós-venda', description: 'Setor de pós-venda e relacionamento', icon: '🤝' },
  { name: 'Assistência Técnica', slug: 'assistencia_tecnica', area: 'Suporte', description: 'Assistência técnica e suporte', icon: '🛠️' },
  { name: 'Engenharia', slug: 'engenharia', area: 'Engenharia', description: 'Setor de engenharia e projetos', icon: '⚙️' },
];
