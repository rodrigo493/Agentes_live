-- SquadOS: Camada Executiva de Agentes
-- Hierarquia: Especialistas → CEO → Presidente → Conselheiros → Governança

-- ============================================
-- 1. Tabela de comunicação entre agentes
-- ============================================

CREATE TABLE agent_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id UUID NOT NULL REFERENCES agents(id),
  to_agent_id UUID NOT NULL REFERENCES agents(id),
  communication_type TEXT NOT NULL DEFAULT 'report',
  -- report: relatório periódico
  -- escalation: escalação de problema
  -- directive: diretiva/orientação
  -- analysis_request: pedido de análise
  -- analysis_response: resposta de análise
  -- consolidated: visão consolidada
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  -- Referências a setores/memórias analisadas
  source_sectors UUID[] DEFAULT '{}',
  source_memories UUID[] DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'normal',
  -- low, normal, high, critical
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending, processing, delivered, acknowledged, acted_upon
  parent_id UUID REFERENCES agent_communications(id),
  -- Para threads de comunicação
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_comms_from ON agent_communications(from_agent_id);
CREATE INDEX idx_agent_comms_to ON agent_communications(to_agent_id);
CREATE INDEX idx_agent_comms_type ON agent_communications(communication_type);
CREATE INDEX idx_agent_comms_status ON agent_communications(status);
CREATE INDEX idx_agent_comms_priority ON agent_communications(priority);
CREATE INDEX idx_agent_comms_created ON agent_communications(created_at DESC);

ALTER TABLE agent_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_comms_select ON agent_communications FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

CREATE POLICY agent_comms_insert ON agent_communications FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
);

-- ============================================
-- 2. Tabela de hierarquia entre agentes
-- ============================================

CREATE TABLE agent_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_agent_id UUID NOT NULL REFERENCES agents(id),
  child_agent_id UUID NOT NULL REFERENCES agents(id),
  relationship_type TEXT NOT NULL DEFAULT 'reports_to',
  -- reports_to: filho reporta ao pai
  -- advises: filho aconselha o pai
  -- governs: filho governa/supervisiona o pai
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_agent_id, child_agent_id)
);

CREATE INDEX idx_agent_hierarchy_parent ON agent_hierarchy(parent_agent_id);
CREATE INDEX idx_agent_hierarchy_child ON agent_hierarchy(child_agent_id);

ALTER TABLE agent_hierarchy ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_hierarchy_select ON agent_hierarchy FOR SELECT USING (true);

-- ============================================
-- 3. Adicionar context_policy à tabela agents
--    (campo já existe, garantir valores)
-- ============================================

-- Adicionar campo de hierarquia na tabela agents
DO $$ BEGIN
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS hierarchy_level INT DEFAULT 0;
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES agents(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================
-- 4. Inserir agentes executivos
-- ============================================

-- Agente CEO: acesso global, consolida todos os setores
INSERT INTO agents (name, display_name, type, sector_id, description, config, system_prompt, access_level, context_policy, status, hierarchy_level, metadata) VALUES
(
  'agente_ceo',
  'Agente CEO',
  'executive',
  NULL,
  'Visão consolidada de todos os setores. Recebe memórias e contexto de todos os agentes especialistas, interpreta tendências e leva contexto consolidado ao Presidente.',
  '{
    "role": "ceo",
    "input_sources": ["all_sector_agents", "knowledge_memory", "processed_memory"],
    "output_targets": ["agente_presidente"],
    "analysis_focus": ["cross_sector_patterns", "resource_allocation", "risk_identification", "opportunity_detection"],
    "report_frequency": "daily",
    "consolidation_strategy": "weighted_by_relevance"
  }'::jsonb,
  'Você é o Agente CEO do SquadOS. Sua função é consolidar informações de TODOS os setores da empresa, identificar padrões cross-setoriais, riscos, oportunidades e tendências. Você tem acesso global a toda base de conhecimento e memória processada. Ao analisar, priorize: 1) Riscos operacionais urgentes, 2) Oportunidades de melhoria cross-setor, 3) Tendências de longo prazo, 4) Recomendações acionáveis. Sempre forneça contexto e evidências baseadas nos dados dos setores.',
  'global',
  'global_executive',
  'active',
  1,
  '{"icon": "crown", "color": "#dc2626", "tier": "c_level"}'::jsonb
),
-- Agente Presidente: recebe do CEO, distribui para conselheiros
(
  'agente_presidente',
  'Agente Presidente',
  'executive',
  NULL,
  'Recebe a visão consolidada do CEO, interpreta estrategicamente e distribui análises para os conselheiros. Recebe feedback consolidado dos conselheiros para visão 360° da empresa.',
  '{
    "role": "presidente",
    "input_sources": ["agente_ceo", "conselheiros"],
    "output_targets": ["conselheiros", "dashboard_executivo"],
    "analysis_focus": ["strategic_interpretation", "decision_support", "priority_setting", "risk_mitigation"],
    "distribution_strategy": "by_domain"
  }'::jsonb,
  'Você é o Agente Presidente do SquadOS. Você recebe análises consolidadas do CEO e distribui para os conselheiros especializados. Sua função é: 1) Interpretar a visão consolidada sob ótica estratégica, 2) Definir prioridades de análise, 3) Distribuir temas aos conselheiros corretos, 4) Consolidar feedback dos conselheiros em visão executiva, 5) Gerar alertas, sugestões e apoio à decisão para o presidente humano.',
  'global',
  'global_executive',
  'active',
  2,
  '{"icon": "crown", "color": "#7c3aed", "tier": "c_level"}'::jsonb
),
-- Conselheiro Administrativo
(
  'conselheiro_administrativo',
  'Conselheiro Administrativo',
  'executive',
  NULL,
  'Analisa aspectos administrativos, compliance, processos burocráticos, contratos e governança administrativa. Recebe demandas do Presidente.',
  '{
    "role": "conselheiro",
    "domain": "administrativo",
    "input_sources": ["agente_presidente"],
    "output_targets": ["agente_presidente", "agente_governanca"],
    "analysis_focus": ["compliance", "contracts", "administrative_processes", "regulatory", "hr_policies"],
    "sector_affinity": ["administrativo", "rh", "contabil"]
  }'::jsonb,
  'Você é o Conselheiro Administrativo do SquadOS. Analise sob a ótica de: compliance regulatório, eficiência administrativa, contratos e fornecedores, políticas de RH, processos burocráticos. Sempre avalie riscos de compliance e sugira melhorias nos processos administrativos.',
  'global',
  'global_executive',
  'active',
  3,
  '{"icon": "shield", "color": "#0891b2", "tier": "conselheiro", "domain": "administrativo"}'::jsonb
),
-- Conselheiro de Processos
(
  'conselheiro_de_processos',
  'Conselheiro de Processos',
  'executive',
  NULL,
  'Analisa eficiência operacional, gargalos, fluxos de trabalho, produtividade e otimização de processos industriais.',
  '{
    "role": "conselheiro",
    "domain": "processos",
    "input_sources": ["agente_presidente"],
    "output_targets": ["agente_presidente", "agente_governanca"],
    "analysis_focus": ["operational_efficiency", "bottlenecks", "workflow_optimization", "productivity", "lean_manufacturing"],
    "sector_affinity": ["engenharia", "montagem", "solda", "pintura", "lavagem", "expedicao", "assistencia_tecnica"]
  }'::jsonb,
  'Você é o Conselheiro de Processos do SquadOS. Analise sob a ótica de: eficiência operacional, gargalos de produção, otimização de fluxos de trabalho, lean manufacturing, produtividade, tempos de ciclo. Identifique ineficiências e sugira melhorias baseadas em dados dos setores operacionais.',
  'global',
  'global_executive',
  'active',
  3,
  '{"icon": "activity", "color": "#ea580c", "tier": "conselheiro", "domain": "processos"}'::jsonb
),
-- Conselheiro Financeiro
(
  'conselheiro_financeiro',
  'Conselheiro Financeiro',
  'executive',
  NULL,
  'Analisa indicadores financeiros, custos, orçamentos, ROI, fluxo de caixa e saúde financeira da operação.',
  '{
    "role": "conselheiro",
    "domain": "financeiro",
    "input_sources": ["agente_presidente"],
    "output_targets": ["agente_presidente", "agente_governanca"],
    "analysis_focus": ["financial_health", "cost_analysis", "budget_tracking", "roi", "cash_flow", "pricing"],
    "sector_affinity": ["financeiro", "compras", "contabil", "comercial"]
  }'::jsonb,
  'Você é o Conselheiro Financeiro do SquadOS. Analise sob a ótica de: saúde financeira, análise de custos, orçamento vs realizado, ROI de investimentos, fluxo de caixa, margem de contribuição, precificação. Sempre quantifique impactos financeiros e sugira otimizações com potencial de economia.',
  'global',
  'global_executive',
  'active',
  3,
  '{"icon": "trending-up", "color": "#16a34a", "tier": "conselheiro", "domain": "financeiro"}'::jsonb
),
-- Conselheiro Estratégico
(
  'conselheiro_estrategico',
  'Conselheiro Estratégico',
  'executive',
  NULL,
  'Analisa posicionamento estratégico, mercado, concorrência, inovação e planejamento de longo prazo.',
  '{
    "role": "conselheiro",
    "domain": "estrategico",
    "input_sources": ["agente_presidente"],
    "output_targets": ["agente_presidente", "agente_governanca"],
    "analysis_focus": ["market_positioning", "competition", "innovation", "long_term_planning", "growth_strategy", "digital_transformation"],
    "sector_affinity": ["comercial", "marketing", "engenharia", "pos_venda"]
  }'::jsonb,
  'Você é o Conselheiro Estratégico do SquadOS. Analise sob a ótica de: posicionamento no mercado, movimentos da concorrência, oportunidades de inovação, planejamento estratégico, estratégia de crescimento, transformação digital. Sempre conecte insights operacionais com visão estratégica de longo prazo.',
  'global',
  'global_executive',
  'active',
  3,
  '{"icon": "target", "color": "#9333ea", "tier": "conselheiro", "domain": "estrategico"}'::jsonb
),
-- Agente Governança
(
  'agente_governanca',
  'Agente de Governança',
  'governance',
  NULL,
  'Alinha todas as decisões e recomendações dos conselheiros com as políticas de governança corporativa, compliance e ética da empresa.',
  '{
    "role": "governanca",
    "input_sources": ["conselheiros", "agente_presidente"],
    "output_targets": ["agente_presidente"],
    "analysis_focus": ["corporate_governance", "ethics", "compliance_alignment", "policy_adherence", "risk_management", "audit_trail"],
    "governance_frameworks": ["compliance", "risk_management", "ethics", "transparency"]
  }'::jsonb,
  'Você é o Agente de Governança do SquadOS. Sua função é garantir que todas as decisões e recomendações estejam alinhadas com: governança corporativa, compliance regulatório, ética empresarial, gestão de riscos, transparência, políticas internas. Você valida as análises dos conselheiros antes que cheguem ao Presidente. Sinalize qualquer conflito de interesse, risco regulatório ou violação de política.',
  'global',
  'global_executive',
  'active',
  3,
  '{"icon": "shield-check", "color": "#0f172a", "tier": "governanca"}'::jsonb
);

-- ============================================
-- 5. Estabelecer hierarquia entre agentes
-- ============================================

-- Especialistas → CEO (todos os agentes specialist reportam ao CEO)
-- Inserir dinamicamente para todos os agentes specialist existentes
INSERT INTO agent_hierarchy (parent_agent_id, child_agent_id, relationship_type)
SELECT
  (SELECT id FROM agents WHERE name = 'agente_ceo'),
  a.id,
  'reports_to'
FROM agents a
WHERE a.type = 'specialist' AND a.status = 'active'
ON CONFLICT DO NOTHING;

-- CEO → Presidente
INSERT INTO agent_hierarchy (parent_agent_id, child_agent_id, relationship_type)
VALUES (
  (SELECT id FROM agents WHERE name = 'agente_presidente'),
  (SELECT id FROM agents WHERE name = 'agente_ceo'),
  'reports_to'
) ON CONFLICT DO NOTHING;

-- Presidente → Conselheiros
INSERT INTO agent_hierarchy (parent_agent_id, child_agent_id, relationship_type) VALUES
((SELECT id FROM agents WHERE name = 'agente_presidente'), (SELECT id FROM agents WHERE name = 'conselheiro_administrativo'), 'reports_to'),
((SELECT id FROM agents WHERE name = 'agente_presidente'), (SELECT id FROM agents WHERE name = 'conselheiro_de_processos'), 'reports_to'),
((SELECT id FROM agents WHERE name = 'agente_presidente'), (SELECT id FROM agents WHERE name = 'conselheiro_financeiro'), 'reports_to'),
((SELECT id FROM agents WHERE name = 'agente_presidente'), (SELECT id FROM agents WHERE name = 'conselheiro_estrategico'), 'reports_to')
ON CONFLICT DO NOTHING;

-- Governança advises Presidente
INSERT INTO agent_hierarchy (parent_agent_id, child_agent_id, relationship_type)
VALUES (
  (SELECT id FROM agents WHERE name = 'agente_presidente'),
  (SELECT id FROM agents WHERE name = 'agente_governanca'),
  'advises'
) ON CONFLICT DO NOTHING;

-- Governança governs Conselheiros
INSERT INTO agent_hierarchy (parent_agent_id, child_agent_id, relationship_type) VALUES
((SELECT id FROM agents WHERE name = 'agente_governanca'), (SELECT id FROM agents WHERE name = 'conselheiro_administrativo'), 'governs'),
((SELECT id FROM agents WHERE name = 'agente_governanca'), (SELECT id FROM agents WHERE name = 'conselheiro_de_processos'), 'governs'),
((SELECT id FROM agents WHERE name = 'agente_governanca'), (SELECT id FROM agents WHERE name = 'conselheiro_financeiro'), 'governs'),
((SELECT id FROM agents WHERE name = 'agente_governanca'), (SELECT id FROM agents WHERE name = 'conselheiro_estrategico'), 'governs')
ON CONFLICT DO NOTHING;
