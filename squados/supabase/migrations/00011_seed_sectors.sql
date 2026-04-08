-- SquadOS: Seed 17 initial sectors + specialist agents

-- Create specialist agents first
INSERT INTO agents (name, display_name, type, description, access_level, status) VALUES
  ('agente_solda', 'Agente Solda', 'specialist', 'Agente especialista do setor de soldagem', 'sector', 'draft'),
  ('agente_inspecao_qualidade_solda', 'Agente Inspeção Qualidade Solda', 'specialist', 'Agente especialista de inspeção de qualidade da solda', 'sector', 'draft'),
  ('agente_lavagem', 'Agente Lavagem', 'specialist', 'Agente especialista do setor de lavagem', 'sector', 'draft'),
  ('agente_pintura', 'Agente Pintura', 'specialist', 'Agente especialista do setor de pintura', 'sector', 'draft'),
  ('agente_inspecao_qualidade_pintura', 'Agente Inspeção Qualidade Pintura', 'specialist', 'Agente especialista de inspeção de qualidade da pintura', 'sector', 'draft'),
  ('agente_montagem', 'Agente Montagem', 'specialist', 'Agente especialista do setor de montagem', 'sector', 'draft'),
  ('agente_expedicao', 'Agente Expedição', 'specialist', 'Agente especialista do setor de expedição', 'sector', 'draft'),
  ('agente_compras', 'Agente Compras', 'specialist', 'Agente especialista do setor de compras', 'sector', 'draft'),
  ('agente_comercial', 'Agente Comercial', 'specialist', 'Agente especialista do setor comercial', 'sector', 'draft'),
  ('agente_marketing', 'Agente Marketing', 'specialist', 'Agente especialista do setor de marketing', 'sector', 'draft'),
  ('agente_financeiro', 'Agente Financeiro', 'specialist', 'Agente especialista do setor financeiro', 'sector', 'draft'),
  ('agente_contabil', 'Agente Contábil', 'specialist', 'Agente especialista do setor contábil', 'sector', 'draft'),
  ('agente_administrativo', 'Agente Administrativo', 'specialist', 'Agente especialista do setor administrativo', 'sector', 'draft'),
  ('agente_rh', 'Agente RH', 'specialist', 'Agente especialista de recursos humanos', 'sector', 'draft'),
  ('agente_pos_venda', 'Agente Pós-venda', 'specialist', 'Agente especialista de pós-venda', 'sector', 'draft'),
  ('agente_assistencia_tecnica', 'Agente Assistência Técnica', 'specialist', 'Agente especialista de assistência técnica', 'sector', 'draft'),
  ('agente_engenharia', 'Agente Engenharia', 'specialist', 'Agente especialista de engenharia', 'sector', 'draft');

-- Create executive agents (draft, for future OpenSquad integration)
INSERT INTO agents (name, display_name, type, description, access_level, status) VALUES
  ('agente_ceo', 'Agente CEO', 'executive', 'Agente executivo com visão consolidada total', 'global', 'draft'),
  ('agente_presidente', 'Agente Presidente', 'executive', 'Agente executivo do presidente', 'global', 'draft'),
  ('conselheiro_administrativo', 'Conselheiro Administrativo', 'executive', 'Conselheiro para análise administrativa', 'global', 'draft'),
  ('conselheiro_de_processos', 'Conselheiro de Processos', 'executive', 'Conselheiro para análise de processos', 'global', 'draft'),
  ('conselheiro_financeiro', 'Conselheiro Financeiro', 'executive', 'Conselheiro para análise financeira', 'global', 'draft'),
  ('conselheiro_estrategico', 'Conselheiro Estratégico', 'executive', 'Conselheiro para análise estratégica', 'global', 'draft'),
  ('agente_governanca', 'Agente Governança', 'governance', 'Agente de governança e alinhamento de decisões', 'global', 'draft');

-- Create sectors and link to agents
INSERT INTO sectors (name, slug, description, area, icon, agent_id) VALUES
  ('Solda', 'solda', 'Setor de soldagem', 'Produção', '🔥',
    (SELECT id FROM agents WHERE name = 'agente_solda')),
  ('Inspeção de Qualidade - Solda', 'inspecao_qualidade_solda', 'Inspeção e controle de qualidade da solda', 'Qualidade', '🔍',
    (SELECT id FROM agents WHERE name = 'agente_inspecao_qualidade_solda')),
  ('Lavagem', 'lavagem', 'Setor de lavagem de peças', 'Produção', '💧',
    (SELECT id FROM agents WHERE name = 'agente_lavagem')),
  ('Pintura', 'pintura', 'Setor de pintura', 'Produção', '🎨',
    (SELECT id FROM agents WHERE name = 'agente_pintura')),
  ('Inspeção de Qualidade - Pintura', 'inspecao_qualidade_pintura', 'Inspeção e controle de qualidade da pintura', 'Qualidade', '🔎',
    (SELECT id FROM agents WHERE name = 'agente_inspecao_qualidade_pintura')),
  ('Montagem', 'montagem', 'Setor de montagem final', 'Produção', '🔧',
    (SELECT id FROM agents WHERE name = 'agente_montagem')),
  ('Expedição', 'expedicao', 'Setor de expedição e logística', 'Logística', '📦',
    (SELECT id FROM agents WHERE name = 'agente_expedicao')),
  ('Compras', 'compras', 'Setor de compras e suprimentos', 'Suprimentos', '🛒',
    (SELECT id FROM agents WHERE name = 'agente_compras')),
  ('Comercial', 'comercial', 'Setor comercial e vendas', 'Comercial', '💼',
    (SELECT id FROM agents WHERE name = 'agente_comercial')),
  ('Marketing', 'marketing', 'Setor de marketing e comunicação', 'Marketing', '📢',
    (SELECT id FROM agents WHERE name = 'agente_marketing')),
  ('Financeiro', 'financeiro', 'Setor financeiro', 'Financeiro', '💰',
    (SELECT id FROM agents WHERE name = 'agente_financeiro')),
  ('Contábil', 'contabil', 'Setor de contabilidade', 'Financeiro', '📊',
    (SELECT id FROM agents WHERE name = 'agente_contabil')),
  ('Administrativo', 'administrativo', 'Setor administrativo', 'Administrativo', '🏢',
    (SELECT id FROM agents WHERE name = 'agente_administrativo')),
  ('RH', 'rh', 'Recursos humanos', 'RH', '👥',
    (SELECT id FROM agents WHERE name = 'agente_rh')),
  ('Pós-venda', 'pos_venda', 'Setor de pós-venda e relacionamento', 'Pós-venda', '🤝',
    (SELECT id FROM agents WHERE name = 'agente_pos_venda')),
  ('Assistência Técnica', 'assistencia_tecnica', 'Assistência técnica e suporte', 'Suporte', '🛠️',
    (SELECT id FROM agents WHERE name = 'agente_assistencia_tecnica')),
  ('Engenharia', 'engenharia', 'Setor de engenharia e projetos', 'Engenharia', '⚙️',
    (SELECT id FROM agents WHERE name = 'agente_engenharia'));

-- Link agents back to their sectors
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'solda') WHERE name = 'agente_solda';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'inspecao_qualidade_solda') WHERE name = 'agente_inspecao_qualidade_solda';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'lavagem') WHERE name = 'agente_lavagem';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'pintura') WHERE name = 'agente_pintura';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'inspecao_qualidade_pintura') WHERE name = 'agente_inspecao_qualidade_pintura';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'montagem') WHERE name = 'agente_montagem';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'expedicao') WHERE name = 'agente_expedicao';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'compras') WHERE name = 'agente_compras';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'comercial') WHERE name = 'agente_comercial';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'marketing') WHERE name = 'agente_marketing';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'financeiro') WHERE name = 'agente_financeiro';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'contabil') WHERE name = 'agente_contabil';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'administrativo') WHERE name = 'agente_administrativo';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'rh') WHERE name = 'agente_rh';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'pos_venda') WHERE name = 'agente_pos_venda';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'assistencia_tecnica') WHERE name = 'agente_assistencia_tecnica';
UPDATE agents SET sector_id = (SELECT id FROM sectors WHERE slug = 'engenharia') WHERE name = 'agente_engenharia';
