# Política de Contexto e Acesso — Live Universe
**Data:** 2026-04-07
**Setores:** Todos os 17 setores
**Versão:** 1.0.0
**Agente:** Gabriel Governança ⚖️

---

## Princípios de Governança

1. **Default deny:** Nenhum agente acessa dados de outro setor sem política explícita de permissão
2. **Menor privilégio:** Cada agente recebe apenas o contexto mínimo necessário para cumprir sua missão
3. **Hierarquia explícita:** A visibilidade executiva é uma camada de leitura agregada — nunca raw
4. **LGPD como constraint:** Dados pessoais são tratados como restrição de design, não detalhe de implementação
5. **Auditabilidade obrigatória:** Toda leitura de contexto cross-setor gera log imutável

---

## Modelo de Controle de Acesso

A Live Universe utiliza **RBAC + ABAC** combinados:

- **RBAC** (Role-Based): define o que cada cargo pode acessar
- **ABAC** (Attribute-Based): refina com atributos como `setor_id`, `classification`, `data_sensível`

### Roles do Sistema

| Role | Descrição |
|------|-----------|
| `operador` | Colaborador do setor — acessa apenas o agente do próprio setor |
| `supervisor` | Supervisor do setor — acessa agente + logs do setor |
| `gerente` | Gerente de área — acessa agentes dos setores sob sua gestão |
| `diretoria` | Diretor operacional — acessa visão agregada + setores da área |
| `ceo` | CEO — acessa dashboard executivo de todos os setores |
| `presidente` | Presidente — leitura completa, sem restrição de setor |
| `conselheiro` | Conselheiro — leitura de relatórios executivos aprovados |
| `governanca` | Papel de auditoria — leitura de logs e policies, sem acesso a dados operacionais |
| `admin_sistema` | TI/Admin — gerencia sistema, sem acesso a dados de negócio |

---

## Políticas por Contexto de Acesso

### A. Chat com Agente (chat_agente)

O chat é o contexto primário de operação. Cada sessão de chat pertence a um setor e está isolada.

| Regra | Descrição |
|-------|-----------|
| **CA-01** | Usuário só inicia chat com o agente do seu próprio setor (`setor_id` do usuário = `setor_id` do agente) |
| **CA-02** | Supervisor pode iniciar chat com qualquer agente dos setores sob sua gestão |
| **CA-03** | Gerente pode ler histórico de chat do seu agente (sem escrever no contexto de outros usuários) |
| **CA-04** | CEO, Presidente e Conselheiro não iniciam chat com agentes operacionais — usam apenas a camada executiva |
| **CA-05** | Mensagens do chat são armazenadas com `user_id`, `setor_id`, `created_at` e `classification` |
| **CA-06** | Agente NÃO cita dados de outros setores no chat, mesmo que tecnicamente acessível |

### B. Workspace Setorial (workspace)

O workspace é o painel do setor: documentos, indicadores, histórico de NCs, knowledge base.

| Regra | Descrição |
|-------|-----------|
| **WS-01** | Workspace é isolado por `setor_id` — um operador nunca vê o workspace de outro setor |
| **WS-02** | Supervisor vê o workspace completo do setor, incluindo rascunhos e logs |
| **WS-03** | Gerente vê workspace de todos os setores sob sua gestão (modo read-only para setores que não são os seus) |
| **WS-04** | Knowledge base do workspace é pública dentro do setor, mas não entre setores |
| **WS-05** | Itens com `classification = confidential` são visíveis apenas para supervisor+ dentro do setor |

### C. Grupos de Trabalho (grupos)

Grupos são espaços cross-setor criados para projetos, equipes ou iniciativas transversais.

| Regra | Descrição |
|-------|-----------|
| **GR-01** | Grupos são criados por gerente ou superior, com lista explícita de membros |
| **GR-02** | Membro de um grupo acessa apenas os setores aos quais pertence pelo grupo — não todos os setores |
| **GR-03** | Grupos NÃO herdam acesso ao chat_agente — apenas ao workspace compartilhado do grupo |
| **GR-04** | Dados com `classification = confidential` (financeiro, RH) nunca entram em grupos cross-setor |
| **GR-05** | Toda adição/remoção de membro de grupo é logada com `user_id`, `ação`, `timestamp`, `quem_autorizou` |

---

## Visibilidade Executiva por Setor

A camada executiva fornece visões **agregadas e anonimizadas** para CEO, Presidente e Conselheiros.
Nenhum dado raw ou identificável de colaborador aparece nessa camada.

| Setor | O que CEO/Presidência vê | O que NÃO vê |
|-------|--------------------------|--------------|
| **solda** | NCs abertas/fechadas no mês, taxa de retrabalho, tempo médio de parada por manutenção | Conversas individuais, dados pessoais da equipe, NCs em análise |
| **inspecao_qualidade_solda** | % de lotes aprovados/reprovados, principais tipos de defeito, tempo médio de inspeção | Quem inspecionou cada peça, detalhes de lotes em disputa |
| **lavagem** | Volume de lotes processados, ocorrências de reprocessamento | Conversas do setor, dados de químicos específicos |
| **pintura** | % de lotes aprovados, defeitos mais frequentes, consumo de tinta (litros/mês) | Valores de contratos de tinta, conversas individuais |
| **inspecao_qualidade_pintura** | % aprovação por acabamento, ranking de defeitos | Dados individuais de peças, laudo por lote em análise |
| **montagem** | Produção diária (unidades), NCs de montagem, tempo médio por modelo | BOM interno, torques específicos, conversas da linha |
| **expedicao** | Pedidos expedidos/atrasados, SLA atingido %, custo de frete médio | Endereços de clientes, dados pessoais de destinatários |
| **compras** | Prazo médio de entrega por categoria, fornecedores com problema recorrente | Valores de contratos individuais, condições comerciais negociadas |
| **engenharia** | ECOs emitidos no período, ensaios pendentes, defeitos de campo com impacto em produto | Detalhes técnicos de ECO em andamento, especificações confidenciais |
| **assistencia_tecnica** | Chamados abertos/fechados, defeitos mais frequentes por modelo, tempo médio de resolução | Dados pessoais de clientes, detalhes de chamados individuais |
| **comercial** | Pipeline (leads, propostas, fechamentos) por período, taxa de conversão, ticket médio por linha | Dados individuais de clientes, condições especiais negociadas |
| **marketing** | Alcance e engajamento por canal, campanhas ativas, leads gerados | Dados de seguidores individuais, dados de terceiros de mídia paga |
| **pos_venda** | NPS/CSAT médio, reclamações abertas/resolvidas, tempo médio de resolução | Nome de clientes reclamantes, dados de protocolo individual |
| **financeiro** | Indicadores de saúde financeira (DRE simplificado), % de inadimplência, dias de caixa | Valores absolutos de contas, saldos bancários, dados de fornecedores individuais |
| **contabil** | Status de obrigações fiscais (entregue/pendente), alertas de prazo | Valores de declarações, dados de funcionários na folha |
| **administrativo** | Contratos de serviço com renovação próxima, incidentes de TI abertos | Dados de contratos confidenciais, inventário de TI detalhado |
| **rh** | Headcount por setor, posições em aberto, % de turnover geral | Dados de qualquer colaborador individualmente, salários, motivo de saída |

---

## Políticas RLS — Supabase Row Level Security

As políticas abaixo são implementadas no Supabase. O isolamento primário é por `setor_id` (UUID).

> **Convenção:** `auth.jwt() ->> 'setor_id'` retorna o UUID do setor do usuário logado.
> `auth.jwt() ->> 'role'` retorna o papel do usuário no sistema.

### Tabela: `messages`

```sql
-- Operador lê apenas mensagens do próprio setor
CREATE POLICY "messages_read_own_sector"
ON messages FOR SELECT
USING (
  setor_id = (auth.jwt() ->> 'setor_id')::uuid
  OR auth.jwt() ->> 'role' IN ('supervisor', 'gerente', 'diretoria', 'ceo', 'presidente', 'admin_sistema')
);

-- Operador escreve apenas no próprio setor
CREATE POLICY "messages_insert_own_sector"
ON messages FOR INSERT
WITH CHECK (
  setor_id = (auth.jwt() ->> 'setor_id')::uuid
  AND auth.jwt() ->> 'role' NOT IN ('conselheiro', 'governanca')
);

-- Apenas admin_sistema pode deletar mensagens (via retenção automatizada)
CREATE POLICY "messages_delete_admin_only"
ON messages FOR DELETE
USING (auth.jwt() ->> 'role' = 'admin_sistema');
```

### Tabela: `processed_memory`

```sql
-- Leitura isolada por setor — supervisor+ podem ler do setor gerenciado
CREATE POLICY "processed_memory_read"
ON processed_memory FOR SELECT
USING (
  setor_id = (auth.jwt() ->> 'setor_id')::uuid
  OR auth.jwt() ->> 'role' IN ('gerente', 'diretoria', 'ceo', 'presidente', 'admin_sistema')
);

-- Apenas o sistema (service_role) escreve em processed_memory — nunca o usuário diretamente
CREATE POLICY "processed_memory_insert_system_only"
ON processed_memory FOR INSERT
WITH CHECK (auth.role() = 'service_role');
```

### Tabela: `knowledge_memory`

```sql
-- Leitura: operador lê knowledge do próprio setor; executivos leem tudo
CREATE POLICY "knowledge_memory_read"
ON knowledge_memory FOR SELECT
USING (
  setor_id = (auth.jwt() ->> 'setor_id')::uuid
  OR auth.jwt() ->> 'role' IN ('supervisor', 'gerente', 'diretoria', 'ceo', 'presidente')
);

-- Escrita: apenas supervisor+ dentro do setor ou service_role (consolidação automática)
CREATE POLICY "knowledge_memory_insert"
ON knowledge_memory FOR INSERT
WITH CHECK (
  (
    setor_id = (auth.jwt() ->> 'setor_id')::uuid
    AND auth.jwt() ->> 'role' IN ('supervisor', 'gerente', 'admin_sistema')
  )
  OR auth.role() = 'service_role'
);

-- Dado confidencial — camada extra: financeiro e RH só para diretoria+
CREATE POLICY "knowledge_memory_confidential"
ON knowledge_memory FOR SELECT
USING (
  CASE
    WHEN classification = 'confidential' THEN
      auth.jwt() ->> 'role' IN ('diretoria', 'ceo', 'presidente', 'admin_sistema')
    ELSE
      setor_id = (auth.jwt() ->> 'setor_id')::uuid
      OR auth.jwt() ->> 'role' IN ('supervisor', 'gerente', 'diretoria', 'ceo', 'presidente')
  END
);
```

### Tabela: `executive_views` (visibilidade executiva)

```sql
-- Apenas ceo, presidente e conselheiros leem a camada executiva
CREATE POLICY "executive_views_read"
ON executive_views FOR SELECT
USING (
  auth.jwt() ->> 'role' IN ('ceo', 'presidente', 'conselheiro', 'governanca', 'admin_sistema')
);

-- Escrita exclusiva do service_role (computed views, nunca manual)
CREATE POLICY "executive_views_insert_system_only"
ON executive_views FOR INSERT
WITH CHECK (auth.role() = 'service_role');
```

### Tabela: `audit_log`

```sql
-- Audit log é append-only: ninguém deleta, apenas service_role insere
CREATE POLICY "audit_log_read"
ON audit_log FOR SELECT
USING (
  auth.jwt() ->> 'role' IN ('governanca', 'admin_sistema', 'ceo', 'presidente')
);

CREATE POLICY "audit_log_insert_system_only"
ON audit_log FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Ninguém deleta logs — nunca
CREATE POLICY "audit_log_no_delete"
ON audit_log FOR DELETE
USING (false);
```

---

## Tabela de Auditoria

Toda operação cross-setor ou de dados sensíveis gera um registro em `audit_log`.

### Schema da tabela `audit_log`

```sql
CREATE TABLE audit_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  timestamptz DEFAULT now() NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  setor_id    uuid REFERENCES setores(id),
  action      text NOT NULL,             -- 'read', 'write', 'delete', 'escalate', 'cross_sector_access'
  resource    text NOT NULL,             -- tabela/recurso acessado
  resource_id uuid,                      -- ID do registro, quando aplicável
  metadata    jsonb DEFAULT '{}',        -- contexto adicional (ex: motivo, agente_id)
  ip_address  inet,
  user_agent  text
);

-- Índices para queries de auditoria
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_setor_id ON audit_log(setor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
```

### Eventos que SEMPRE geram log

| Evento | action | Observação |
|--------|--------|------------|
| Leitura de conhecimento de outro setor | `cross_sector_read` | Apenas para gerentes+ |
| Escrita em knowledge_memory confidencial | `confidential_write` | Qualquer role |
| Acesso à camada executiva | `executive_access` | CEO, Presidente, Conselheiro |
| Adição/remoção de membro de grupo | `group_member_change` | Qualquer grupo |
| Solicitação de pagamento urgente (financeiro) | `urgent_payment_request` | Financeiro |
| Acesso a dados de RH por pessoa externa ao setor | `rh_cross_access` | Qualquer leitura externa |
| Criação ou alteração de RLS policy | `rls_policy_change` | Admin sistema |
| Exportação de dados em lote | `bulk_export` | Qualquer role |

---

## Política por Setor — Regras Específicas

### Setores com política padrão (baixo risco)
`solda`, `inspecao_qualidade_solda`, `lavagem`, `pintura`, `inspecao_qualidade_pintura`, `montagem`, `expedicao`, `engenharia`, `marketing`

- Isolamento padrão por `setor_id`
- Sem restrição adicional de `classification`
- Auditoria apenas para eventos listados acima
- Visibilidade executiva via views agregadas

### Setores com política reforçada (risco médio)
`compras`, `assistencia_tecnica`, `comercial`, `pos_venda`, `administrativo`

- Isolamento por `setor_id` + filtro de `classification`
- Dados de clientes/fornecedores: `classification = 'business_confidential'`
- Acesso externo ao setor: apenas gerente+ com log automático
- Export em lote: requer aprovação do supervisor

### Setores com política máxima (alto risco / LGPD crítico)
`financeiro`, `contabil`, `rh`

#### Financeiro
- `classification = 'confidential'` em todos os registros financeiros
- Acesso: somente `financeiro_operador` + `diretoria` + `ceo` + `presidente`
- Nenhum dado de valor absoluto em views executivas — apenas % e indicadores
- Toda consulta gera log `financial_access`
- Retenção de dados: conforme obrigação fiscal (5 anos para dados contábeis)

#### Contábil
- Mesmas regras do financeiro
- Dados de SPED e declarações: acesso exclusivo `contabil_operador` + `admin_sistema`
- NCM e alíquotas: acesso público dentro do setor contábil + leitura por engenharia (cross-setor permitido via policy explícita)

#### RH — Máxima Restrição
- Dados de colaboradores individuais: `classification = 'personal_data'`
  - Acesso: somente `rh_operador` + `admin_sistema`
  - Nenhum dado individual visível na camada executiva
  - Consolidação de memória desativada para dados pessoais
- Dados de processo (vagas, treinamentos): `classification = 'internal'`
  - Acesso: `rh_operador` + `gerente_rh` + `diretoria`
- Auditoria: **todos** os acessos a dados de RH são logados, sem exceção
- Base legal LGPD documentada em cada registro: `lgpd_basis` = "contrato_trabalho" | "obrigacao_legal" | "consentimento"

---

## Política de Cross-Setor Permitido

Algumas relações cross-setor são necessárias e permitidas por policy explícita:

| Setor origem | Setor destino | Tipo de acesso | Justificativa |
|-------------|---------------|----------------|---------------|
| engenharia | montagem | Leitura de spec de montagem | Validação de ECO |
| assistencia_tecnica | engenharia | Leitura de boletins técnicos | Resolução de chamados |
| compras | financeiro | Leitura de limite de aprovação | Fluxo de PO |
| pos_venda | assistencia_tecnica | Leitura de status de chamados | Retorno ao cliente |
| comercial | pos_venda | Leitura de NPS/reclamações agregadas | Feedback de vendas |
| contabil | rh | Leitura de headcount e base de cálculo | Folha de pagamento (via service_role) |
| agente_ceo | todos | Leitura de executive_views | Dashboard executivo |
| agente_presidente | todos | Leitura de executive_views + processed_memory | Governança estratégica |
| governanca | todos | Leitura de audit_log | Auditoria independente |

**Regra:** Todo acesso cross-setor fora desta tabela é **negado por padrão** e gera alerta.

---

## Hierarquia Executiva — Fluxo de Visibilidade

```
Operadores / Colaboradores
      ↓ (chat_agente, workspace próprio)
Agentes Setoriais (17 agentes)
      ↓ (processed_memory agregado por setor)
Supervisores / Gerentes
      ↓ (knowledge_memory + executive_views do setor)
Agente CEO
      ↓ (executive_views de todos os setores, sem dados raw)
Agente Presidente
      ↓ (executive_views + temas estratégicos)
Conselheiros / Governança
      (apenas relatórios aprovados — sem acesso ao sistema live)
```

**Regra inviolável:** Nenhuma camada inferior tem visibilidade da camada superior.
Um operador de solda nunca vê o que o CEO está consultando.

---

*Gerado pelo agente Gabriel Governança ⚖️ — Agentes Fábrica — Live Universe*
*Run ID: 2026-04-07-115128 | Versão: v1*
