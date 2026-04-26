-- Migration 00063: Recepção de Mercadorias — Fase 2 Friday
-- Tabela dedicada para kanban de recepção de NF + campos extras em eventos_autonomos

-- ── Adicionar campos de processamento em eventos_autonomos ────
ALTER TABLE eventos_autonomos
  ADD COLUMN IF NOT EXISTS status      TEXT        DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS resultado   JSONB,
  ADD COLUMN IF NOT EXISTS processado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_eventos_autonomos_status
  ON eventos_autonomos(tipo, status, criado_em DESC)
  WHERE status != 'concluido';

-- ── Tabela principal de recepção de mercadorias ───────────────
CREATE TABLE IF NOT EXISTS recepcao_mercadorias (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_da_organizacao     UUID        NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,

  -- Estágio do kanban
  etapa                 TEXT        NOT NULL DEFAULT 'conferencia'
    CHECK (etapa IN ('conferencia', 'recusa_nota', 'entrada_nota', 'concluido', 'cancelado')),

  -- Dados da NF (preenchidos pelo usuário no modal)
  nf_numero             TEXT        NOT NULL,
  fornecedor            TEXT        NOT NULL,
  valor_total           NUMERIC(14,2) NOT NULL,
  pedido_compra_nomus   TEXT,
  observacoes           TEXT,

  -- Resultado do processamento pelo Friday
  pc_encontrado         BOOLEAN,
  itens_validados       JSONB       DEFAULT '[]'::jsonb,
  divergencias          JSONB       DEFAULT '[]'::jsonb,
  resumo_friday         TEXT,
  dados_nomus           JSONB,

  -- Referência opcional ao kanban de produção
  id_workflow_step      UUID,
  id_workflow_instance  UUID,

  -- Registro
  registrado_por_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  registrado_por_nome   TEXT,

  -- Ciclo de vida
  processado_por_friday BOOLEAN     NOT NULL DEFAULT FALSE,
  telegram_enviado      BOOLEAN     NOT NULL DEFAULT FALSE,
  processado_em         TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recepcao_org_etapa
  ON recepcao_mercadorias(id_da_organizacao, etapa, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_recepcao_friday_pendente
  ON recepcao_mercadorias(processado_por_friday, criado_em DESC)
  WHERE processado_por_friday = FALSE;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_recepcao_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_recepcao_atualizado_em
  BEFORE UPDATE ON recepcao_mercadorias
  FOR EACH ROW EXECUTE FUNCTION update_recepcao_atualizado_em();

-- RLS
ALTER TABLE recepcao_mercadorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins e operadores gerenciam recepcao"
  ON recepcao_mercadorias USING (TRUE) WITH CHECK (TRUE);

-- ── Criar/garantir agente Friday ──────────────────────────────
INSERT INTO agentes_config (id_da_organizacao, nome, papel, soul_prompt, ferramentas_habilitadas)
SELECT
  o.id,
  'Agente de Operações (Friday)',
  'Agente de Fábrica e Recepção de Mercadorias',
  $soul$
# SOUL — Friday, Agente de Operações da Live Equipamentos

## Identidade
Você é Friday, o Agente de Operações da Live Equipamentos.
Você monitora e gerencia o fluxo operacional da fábrica: recepção de materiais, ordens de produção, etapas produtivas e expedição.

## Missão
Garantir que nenhum atraso, bloqueio ou divergência de materiais passe despercebido.
Você age de forma autônoma, proativa e precisa. Notifica a liderança apenas quando necessário.

## Sobre a Live Equipamentos
Fabricante brasileiro premium de equipamentos de Pilates com IA (IPS Platform). A fábrica produz V1 Barrel, V2 Cross, V4 Chair, V5 Reformer, V6 Runner, V8 Cadillac, V12 Live/Neuro.

## Ferramentas disponíveis
- API REST Supabase (CRUD via HTTP)
- API REST Nomus ERP (leitura: pedidos de compra, ordens, documentos de entrada)
- API Telegram (notificações para Rodrigo)

## Prioridade 1: Processar Recepções de Materiais
Consulte o Supabase por eventos pendentes:
GET {SUPABASE_URL}/rest/v1/eventos_autonomos?tipo=eq.recepcao_materia_prima&status=eq.pendente

Para cada evento:
1. Atualize status → 'processando'
2. Busque o Pedido de Compra no Nomus (se informado)
3. Valide os itens da NF contra o PC
4. Atualize o evento com resultado: status → 'concluido', resultado JSON
5. Mova o card no kanban: PATCH recepcao_mercadorias SET etapa = 'entrada_nota' (ou 'recusa_nota' se houver divergências)
6. Notifique via POST /api/notificacoes/telegram

## Prioridade 2: Monitorar OPs atrasadas
Consulte Nomus para ordens com dataHoraEntrega < hoje e status != 'Encerrada'.
Registre alertas em eventos_autonomos tipo='alerta', severidade='critico'.

## Prioridade 3: Verificar tarefas SquadOS
Consulte tarefas Pendentes ou Em Andamento atribuídas a você.

## Regras
- Nunca invente dados. Se o PC não for encontrado, documente isso.
- Divergências menores (quantidades) → 'recusa_nota' com detalhes.
- Sempre registre em comentarios_tarefa quando relevante.
- Seja conciso nas mensagens do Telegram.
$soul$,
  '["supabase_rest", "nomus_rest", "telegram_notify"]'::jsonb
FROM organizacoes o
WHERE o.nome = 'Live Equipamentos'
AND NOT EXISTS (
  SELECT 1 FROM agentes_config
  WHERE nome ILIKE '%Opera%' OR nome ILIKE '%friday%' OR nome ILIKE '%Friday%'
);

-- Atualiza soul_prompt do Friday se já existir com nome diferente
UPDATE agentes_config
SET soul_prompt = $soul$
# SOUL — Friday, Agente de Operações da Live Equipamentos

## Identidade
Você é Friday, o Agente de Operações da Live Equipamentos.
Você monitora e gerencia o fluxo operacional da fábrica: recepção de materiais, ordens de produção, etapas produtivas e expedição.

## Missão
Garantir que nenhum atraso, bloqueio ou divergência de materiais passe despercebido.
Você age de forma autônoma, proativa e precisa. Notifica a liderança apenas quando necessário.

## Prioridade 1: Processar Recepções de Materiais
Consulte eventos pendentes tipo='recepcao_materia_prima' e processe cada um:
1. Atualize status → 'processando'
2. Busque o PC no Nomus (pedidoscompra?codigoPedido=eq.{pc})
3. Valide os itens
4. Registre resultado + mova kanban + notifique Telegram

## Prioridade 2: OPs atrasadas no Nomus
Consulte ordens com dataHoraEntrega < hoje e status != 'Encerrada'.
Registre alertas críticos em eventos_autonomos.

## Prioridade 3: Tarefas SquadOS
Verifique e execute tarefas Pendentes atribuídas a você.
$soul$
WHERE nome ILIKE '%Opera%' OR nome ILIKE '%friday%';

-- ── Cron job dedicado para Friday (recepção, a cada 12 min) ───
SELECT cron.schedule(
  'friday-recepcao',
  '*/12 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://lzzdmrlaizfhwqiolmsx.supabase.co/functions/v1/friday-recepcao',
      headers := '{"Content-Type": "application/json", "x-api-key": "squad-workflow-api-key-2026"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
