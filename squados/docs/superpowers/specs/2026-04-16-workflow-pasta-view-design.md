# Spec: WorkflowPastaView — Fluxos de Trabalho como Pastas

**Data:** 2026-04-16  
**Status:** Aprovado para implementação

---

## Contexto

A página de Operações da Fábrica (`/operations`) exibe atualmente o `WorkflowFlowsView` (visão de etapas em pipeline) de forma compacta e os Setores Produtivos de forma grande. O objetivo é inverter essa hierarquia visual e transformar os Fluxos de Trabalho numa interface de uso diário: cada fluxo é uma "pasta" onde o usuário vê seus itens ativos, com timer de prazo, diário de bordo e botão para avançar ao próximo responsável.

---

## Modelo Mental

- **Fluxo de trabalho** = pasta (criada pelo admin com etapas e SLAs configurados)
- **Item de trabalho** = arquivo dentro da pasta (ex: PA.0234, PG.0010, OP.0101)
- **Etapa** = em qual pasta o item está no momento (cada etapa tem seu responsável e SLA)
- **Usuário** vê apenas os itens que estão na(s) sua(s) etapa(s) — pode ter múltiplas pastas se participar de múltiplos fluxos
- **Admin** vê todos os itens de todos os fluxos

---

## Layout da Página `/operations`

### Nova hierarquia visual (de cima para baixo):

1. **Fluxos de Trabalho** — grande, ocupa toda a largura, destaque principal
2. **Setores Produtivos** — compacto, linha de pills com nome + contagem de usuários
3. **Setores de Suporte** — igual ao atual (pills compactas)
4. O `WorkflowShell` (motor admin de templates/instâncias) é removido desta página e acessado via rota admin separada (`/admin/workflows` ou aba admin)

---

## Componente `WorkflowPastaView`

**Arquivo:** `src/features/workflows/components/workflow-pasta-view.tsx`  
**Tipo:** Client component com polling a cada 30s

### Lógica de busca

- Usuário comum: busca instâncias onde a etapa ativa tem `assignee_id = user.id` → agrupa por `template_id`
- Admin/master_admin: busca todas as instâncias com status `in_progress` → agrupa por `template_id`

### Renderização

Uma `<Pasta>` por fluxo contendo os `<ItemCard>` do usuário naquele fluxo:

```
📁 Pós-venda                           [2 em atraso]
  [PA.0234] [PG.0010] [PA.0235]

📁 Produção Cama Classic               [5 em andamento]
  [OP.0101] [OP.0099]

📁 Expedição                           [vazio]
  "Nenhum item ativo neste fluxo."
```

---

## Componente `ItemCard`

**Campos exibidos:**
- Referência (ex: `PA.0234`) — negrito, destaque
- Etapa atual + responsável (ex: `Análise Técnica · João Silva`)
- Timer colorido:
  - Verde: >50% do SLA restante
  - Amarelo: ≤30% restante (aviso)
  - Vermelho: vencido → contribui para beacon ATRASO na tarja
- Prazo absoluto (ex: `14/04 às 10:00`)
- Diário de bordo: últimas 2–3 anotações de etapas anteriores (truncadas), expandível
- Botão **"✓ Avançar → [nome próxima etapa]"**
- Botão **"📝 Notas"** — abre painel lateral com histórico completo + campo para nova anotação

**Estados visuais:**
- Borda vermelha + badge ATRASADO: item vencido
- Borda amarela: quase vencendo (≤30% SLA)
- Borda verde suave: no prazo

---

## Ação "Avançar"

Ao clicar em Avançar (com confirmação opcional via loading state):

1. Marca a etapa atual como `completed` com `completed_at = now()`
2. Cria a próxima `workflow_instance_step` com `started_at = now()` e `due_at = now() + sla_hours`
3. Envia mensagem automática no workspace para o responsável da próxima etapa:
   > *"📂 Novo item no seu fluxo: **PA.0234** — [nome da próxima etapa]. Acesse Operações para ver."*
4. Atualiza o hook `useNewAlerts` → badge FLUXO (amarelo) acende na tarja superior para o próximo usuário
5. Remove o item da view do usuário atual (optimistic update)

Se for a última etapa do fluxo: marca a instância inteira como `completed`.

---

## Diário de Bordo

**Armazenamento:** coluna `notes jsonb` na tabela `workflow_instance_steps`

Estrutura de cada entrada:
```json
{
  "author_id": "uuid",
  "author_name": "João Silva",
  "step_title": "Análise Técnica",
  "text": "Defeito no módulo de calibração confirmado.",
  "created_at": "2026-04-16T10:30:00Z"
}
```

- O array acumula entradas de todas as etapas
- O painel de notas mostra o histórico completo em linha do tempo
- Ao avançar, a nota opcional da etapa atual é salva antes de mover

---

## Modal "Novo Item" (Admin)

**Acionado por:** botão `+ Novo Item` no header da seção Fluxos de Trabalho (visível só para admin)

**Campos:**
| Campo | Tipo | Obrigatório |
|---|---|---|
| Referência | texto (ex: PA.0234) | sim |
| Título / Descrição | textarea | sim |
| Fluxo de destino | select (lista de templates ativos) | sim |
| Etapa inicial | select (etapas do fluxo, padrão = primeira) | não |

Ao confirmar: cria `workflow_instance` + primeira `workflow_instance_step` com timer iniciando.

---

## API Endpoint para Integração Externa

**Gatilho:** quando um PA ou PG é **aprovado** no LivePosVenda (CRM), o sistema externo chama este endpoint — criando o item automaticamente no fluxo Pós-venda do SquadOS.

**Rota:** `POST /api/workflow-items`  
**Auth:** API key via header `x-api-key`  
**Body:**
```json
{
  "reference": "PA.0234",
  "title": "Assistência técnica — V12 série 2023",
  "template_id": "uuid-do-fluxo-posVenda",
  "start_step_order": 1,
  "initial_note": "Aprovado no LivePosVenda em 16/04/2026"
}
```
**Resposta:** `{ instance_id, reference, current_step, due_at }`

**Fluxo completo da integração:**
1. Técnico aprova PA/PG no LivePosVenda
2. LivePosVenda chama `POST /api/workflow-items` com os dados do chamado
3. SquadOS cria o item na primeira etapa do fluxo Pós-venda
4. Usuário responsável pela primeira etapa recebe badge FLUXO + mensagem no workspace
5. Item aparece na pasta "Pós-venda" do usuário com timer rodando

A integração end-to-end (webhook no LivePosVenda) é implementada separadamente, mas o endpoint do SquadOS é entregue nesta fase.

---

## Beacon ATRASO — Integração

O hook `useOverdueAlert` (já existente) consulta instâncias vencidas. A nova lógica de `due_at` por etapa alimenta esse hook automaticamente — nenhuma mudança necessária no sistema de beacons.

---

## Mudanças de DB

| Tabela | Mudança |
|---|---|
| `workflow_instance_steps` | Adicionar coluna `notes jsonb DEFAULT '[]'` |
| Nenhuma tabela nova necessária | — |

---

## Setores Produtivos — Novo Visual Compacto

Substitui o grid de cards por uma linha de pills:

```
[● Pedido 2u] [● Engenharia 1u] [● Solda 3u] [● Pintura 2u] ...
```

Cada pill: ponto colorido do setor + nome + contagem de usuários ativos.

---

## Fora do Escopo (esta entrega)

- Webhook no LivePosVenda para disparar a criação automática (endpoint do SquadOS entregue, integração end-to-end é etapa futura)
- Notificação por e-mail ao avançar (já existe para atraso, não para avanço)
- Filtros e busca dentro das pastas
- Histórico de itens concluídos
