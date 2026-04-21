# Workflow Kanban CRM — Design Spec

## Goal

Transformar o sistema de fluxos de trabalho do SquadOS em um board Kanban/CRM completo onde o admin gerencia e visualiza todos os fluxos e usuários, e cada usuário vê e opera apenas suas etapas atribuídas.

## Architecture

O sistema reutiliza o motor de workflows já existente (`workflow_templates`, `workflow_template_steps`, `workflow_instances`, `workflow_steps`) e adiciona:

1. **Nova view Kanban** substituindo/complementando a pasta view atual
2. **Configuração de origem** nos templates (manual, webhook, encadeamento)
3. **Visão admin** com tabs por fluxo + mini-Kanban de todos os itens
4. **Visão usuário** pessoal com apenas suas etapas, de todos os fluxos onde é responsável

## Tech Stack

- Next.js App Router (Server + Client Components)
- Supabase (PostgreSQL + Realtime)
- React com polling/realtime para atualização automática dos cards
- Tailwind CSS + shadcn/ui (padrão existente)

---

## 1. Board Kanban por Fluxo

### Estrutura visual
- Cada **fluxo/template** é um board separado, acessível por tab no topo
- Cada **coluna** = uma etapa do fluxo (`workflow_template_steps`)
- Cada **card** = um item de trabalho ativo (`workflow_steps` + `workflow_instances`)
- Colunas mostram no cabeçalho: nome da etapa, responsável padrão, SLA configurado

### Cards
Cada card exibe:
- Referência do item (ex: `PV.2026.015`)
- Título/descrição
- Responsável atual + avatar
- Timer SLA: verde (>30% tempo), amarelo (≤30%), vermelho (atrasado)
- Último anexo ou nota (se houver)
- **Botão "✓ Concluir etapa → [próxima etapa]"** — avança o item para a próxima coluna e notifica o próximo responsável
- Botão de anexo/nota (📎) — abre sheet lateral

### Cores de status
- Verde `border-l-green-500` — no prazo
- Amarelo `border-l-yellow-500` — menos de 30% do tempo restante
- Vermelho `border-l-red-500` + badge ATRASADO — prazo vencido

---

## 2. Visão Admin

### Painel de controle
- **Números no topo:** total ativos / atrasados / em atenção / no prazo (todos os fluxos)
- **Tabs por fluxo:** uma tab por template ativo + botão "＋ Novo fluxo"
- **Mini-Kanban** dentro de cada tab: todas as colunas + todos os cards de todos os usuários

### Capacidades exclusivas do admin
- Ver todos os cards de todos os usuários em todos os fluxos
- Reatribuir etapa para outro usuário (modal de reassign existente)
- Adicionar nota em qualquer etapa
- Forçar avanço de etapa (mesmo sem ser o responsável)
- Criar/editar/desativar fluxos e etapas
- Criar itens manualmente ("＋ Novo Item")
- Exportar relatório (CSV)

---

## 3. Visão Usuário

### O que o usuário vê
- Apenas as etapas onde é o responsável designado
- Agrupado por fluxo (ex: "📁 Pós-venda · Etapa 3 — Separação de Peças")
- Se for responsável em múltiplos fluxos, vê todos agrupados
- Notificação (DM + badge) quando um item chega para ele

### O que o usuário NÃO vê
- Outras etapas do mesmo fluxo
- Cards de outros usuários
- Configurações de templates
- Métricas globais

### Ações disponíveis
- Concluir etapa (avança o card para a próxima coluna)
- Adicionar nota antes de avançar
- Anexar arquivo/imagem
- Bloquear item com motivo (produto, cliente, fiscal, aprovação, info, técnico, outro)

---

## 4. Configuração de Origem dos Itens (Template Editor)

Ao criar/editar um fluxo, o admin configura **como os itens entram**:

### Opção A — Manual
- Admin preenche referência + título + nota inicial e dispara
- Já funciona hoje via `createWorkItemAction`
- Continuará sendo a forma padrão

### Opção B — Webhook / Integração
- SquadOS gera URL exclusiva por fluxo: `POST /api/webhook/flows/[slug]/[token]`
- Payload recebido é mapeado para campos do item (referência, título, nota inicial)
- Integrações: Nomus ERP, N8N, Zapier, qualquer sistema com webhook
- Token gerado automaticamente, regenerável pelo admin

### Opção C — Encadeamento entre fluxos
- Admin seleciona qual fluxo dispara este, e em qual etapa
- Ao concluir a etapa configurada no fluxo-origem, o sistema cria automaticamente um item neste fluxo
- Dados herdados automaticamente: referência, título, notas e anexos

### Opção D — Múltiplas origens
- Todas as origens acima podem estar ativas simultaneamente
- Todos os itens caem na mesma primeira coluna

---

## 5. Configuração de Etapas (Template Editor — já existe, melhorar)

Cada etapa configura:
- **Nome** da etapa (ex: "Separação de Peças")
- **Responsável**: usuário específico OU setor (auto-atribui ao primeiro ativo do setor)
- **Tempo máximo (SLA)**: em horas — calcula `due_at` automaticamente ao ativar a etapa
- **Ordem**: drag-to-reorder (já existe)

---

## 6. Fluxo de Dados

```
Admin cria template → define etapas + responsáveis + SLA
     ↓
Item entra (manual / webhook / encadeamento)
     ↓
start_workflow_instance RPC → cria instance + ativa step 1
     ↓
Responsável da etapa 1 recebe notificação DM + badge
     ↓
Usuário vê card na sua visão pessoal
     ↓
Usuário anexa arquivos/notas → clica "Concluir etapa"
     ↓
complete_workflow_step RPC → marca step 1 done + ativa step 2
     ↓
Responsável da etapa 2 recebe notificação → ciclo continua
     ↓
Última etapa concluída → instance.status = 'completed'
```

---

## 7. Banco de Dados — Alterações Necessárias

### Nova tabela: `workflow_webhook_configs`
```sql
id uuid PK
template_id uuid FK workflow_templates
token text UNIQUE -- gerado automaticamente
is_active boolean DEFAULT true
field_mapping jsonb -- {"numero_os": "reference", "descricao": "title"}
created_at timestamptz
```

### Nova coluna: `workflow_templates.trigger_config`
```sql
trigger_config jsonb
-- Exemplo: {"type": "flow_chain", "source_template_id": "uuid", "source_step_order": 5}
-- Exemplo: {"type": "webhook", "webhook_config_id": "uuid"}
-- Exemplo: {"type": "manual"}
-- Exemplo: {"type": "multi", "sources": ["manual", "webhook", "flow_chain"]}
```

---

## 8. Novos Componentes

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| KanbanBoard | `workflow-kanban-board.tsx` | Board completo com tabs + colunas |
| KanbanColumn | `workflow-kanban-column.tsx` | Uma coluna do board (uma etapa) |
| KanbanCard | `workflow-kanban-card.tsx` | Card individual com botão avançar |
| AdminKanbanView | `workflow-admin-kanban.tsx` | Visão admin: stats + tabs + boards |
| UserKanbanView | `workflow-user-kanban.tsx` | Visão usuário: etapas pessoais agrupadas |
| WebhookConfigSection | `webhook-config-section.tsx` | Seção de config webhook no template editor |
| FlowTriggerSection | `flow-trigger-section.tsx` | Seção de encadeamento no template editor |

### Arquivos modificados
| Arquivo | Mudança |
|---|---|
| `workflow-shell.tsx` | Adiciona tab "Kanban" com AdminKanbanView |
| `workflow-pasta-view.tsx` | Substituído por UserKanbanView — arquivo removido após migração |
| `template-editor-modal.tsx` | Adiciona seção "Origem dos itens" |
| `pasta-actions.ts` | Adiciona `getKanbanViewAction` agrupando por step_order |
| `operations/page.tsx` | Passa UserKanbanView para todos os usuários |

### Novos server actions
| Action | Arquivo | Descrição |
|---|---|---|
| `getAdminKanbanAction` | `kanban-actions.ts` | Todos os steps de todos os fluxos para admin |
| `getUserKanbanAction` | `kanban-actions.ts` | Steps do usuário logado agrupados por fluxo |
| `saveWebhookConfigAction` | `webhook-actions.ts` | Cria/atualiza config de webhook |
| `regenerateWebhookTokenAction` | `webhook-actions.ts` | Regenera token do webhook |
| `saveFlowTriggerAction` | `template-actions.ts` | Configura encadeamento entre fluxos |
| `handleWebhookIngestAction` | `webhook-actions.ts` | Processa payload recebido e cria item |

---

## 9. API Route — Webhook Receiver

```
POST /api/webhook/flows/[slug]/[token]
Body: { qualquer payload JSON }
Response: { instance_id, reference } ou { error }
```

- Valida token contra `workflow_webhook_configs`
- Mapeia campos via `field_mapping`
- Chama `start_workflow_instance` RPC
- Retorna 200 com `instance_id` ou 401/404

---

## 10. Realtime

- Supabase Realtime subscription em `workflow_steps` filtrado por `assignee_id = user.id`
- Admin: subscription filtrada pelos `template_id` dos fluxos ativos visíveis (evita sobrecarga)
- Atualiza os cards automaticamente sem refresh manual
- Fallback: polling a cada 30s (já existe no pasta-view)

---

## Fora de Escopo (próximas versões)

- Drag-and-drop de cards entre colunas (avançar por arrastar)
- Métricas de tempo médio por etapa (bottleneck analysis)
- Comentários em tempo real (tipo chat dentro do card)
- Templates de formulário por etapa (campos customizados)
- Notificações push mobile para cada avanço
