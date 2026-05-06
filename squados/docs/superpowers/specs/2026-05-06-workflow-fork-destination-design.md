# Spec: Destinos de Etapa + Fork de Fluxo Cruzado

**Data:** 2026-05-06
**Branch:** feat/problemas-producao
**Status:** Aprovado

---

## 1. Contexto

O kanban de Operação do SquadOS já suporta `branch_options` (ramificação manual entre etapas do mesmo fluxo), mas sem UI visual no editor de etapa. Também não existe mecanismo para que uma etapa dispare automaticamente a criação de um card em outro fluxo.

Este spec define dois recursos novos no editor de etapa (coluna do kanban):

1. **Seletor de etapas de destino** — escolha visual das rotas possíveis dentro do mesmo fluxo
2. **Fork de fluxo cruzado** — ao entrar numa etapa configurada, o sistema cria automaticamente uma cópia do card em outro fluxo, bloqueia o original e o desbloqueia com animação quando a cópia chegar à etapa de resolução

---

## 2. Modelo de Dados

### 2.1 Migration `00068_workflow_fork.sql`

#### `workflow_template_steps` — colunas novas

```sql
ALTER TABLE workflow_template_steps
  ADD COLUMN IF NOT EXISTS fork_template_id        UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fork_entry_step_order   INT,
  ADD COLUMN IF NOT EXISTS fork_resolve_step_title TEXT;
```

- `fork_template_id`: fluxo alvo do fork. NULL = sem fork configurado.
- `fork_entry_step_order`: `step_order` da etapa de entrada no fluxo alvo.
- `fork_resolve_step_title`: título da etapa do fluxo fork que, ao ser atingida, desbloqueia o card original.

#### `workflow_steps` — colunas novas

```sql
ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS fork_instance_id UUID REFERENCES workflow_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unblocked_at     TIMESTAMPTZ;
```

- `fork_instance_id`: aponta para a instância fork criada por este step. Usado para rastrear resolução.
- `unblocked_at`: timestamp do desbloqueio. Quando presente (< 30 min), a UI exibe a animação "LIBERADO".

#### Novo block reason

```sql
INSERT INTO workflow_block_reasons (code, label, category, is_active)
VALUES ('FORK_PENDING', 'Aguardando fluxo paralelo', 'system', true)
ON CONFLICT (code) DO NOTHING;
```

### 2.2 Tipos TypeScript (`src/shared/types/database.ts`)

`WorkflowTemplateStep` recebe os campos que já existem no DB mas faltavam no tipo:

```typescript
branch_options: Array<{ label: string; target_title: string }> | null
complete_label: string | null
fork_template_id: string | null
fork_entry_step_order: number | null
fork_resolve_step_title: string | null
```

`WorkflowStep` recebe:

```typescript
fork_instance_id: string | null
unblocked_at: string | null
```

---

## 3. UI — Editor de Etapa (workflow-kanban-column.tsx)

O modal de edição de coluna ganha dois blocos novos abaixo dos campos existentes (título, SLA, responsável, setor).

### 3.1 Bloco A — "Etapas de destino"

- Título da seção: `Etapas de destino`
- Lista de checkboxes com todas as outras etapas do mesmo template, ordenadas por `step_order`
- Cada checkbox tem o título da etapa
- Estado inicial: derivado do `branch_options` atual da etapa
- Ao salvar: gera `branch_options = [{label: step.title, target_title: step.title}, ...]`
- Nenhuma marcada → `branch_options = null` → avanço linear mantido

### 3.2 Bloco B — "Fork de fluxo"

- Botão "Configurar fork de fluxo" com ícone de bifurcação
- Abre painel inline (não modal) com três controles:

| Campo | Tipo | Comportamento |
|-------|------|---------------|
| Fluxo de destino | Select | Todos os templates ativos + "Nenhum" no topo |
| Etapa de entrada | Select | Step orders do template selecionado. Visível só se fluxo ≠ Nenhum |
| Etapa de resolução | Select | Títulos das etapas do template selecionado. Visível só se fluxo ≠ Nenhum |

- "Nenhum" limpa `fork_template_id`, `fork_entry_step_order`, `fork_resolve_step_title`
- Ao salvar a etapa, os três campos são salvos juntos via `upsertTemplateStepAction`
- Se configurado, mostra resumo: `→ [NomeFluxo] / [TítuloEtapa entrada] (resolve em [TítuloEtapa resolução])`

---

## 4. UI — Card no Kanban (workflow-kanban-card.tsx)

### 4.1 Botões de destino

| Condição | Visual |
|----------|--------|
| `branch_options` com N itens | N botões inline, um por destino, cada um chama `advanceWithNoteAction(stepId, undefined, target_title)` |
| `branch_options` null ou vazio | Botão único "Avançar" → avanço linear (comportamento atual) |

O `BranchDialog` existente é removido — os botões ficam diretamente no card.

### 4.2 Estado bloqueado por fork

Quando `status = 'blocked'` e `block_reason_code = 'FORK_PENDING'`:

- Badge âmbar: `Aguardando fluxo paralelo`
- Botões de avanço ocultados
- Ícone de relógio/espera

### 4.3 Animação "LIBERADO"

Quando `unblocked_at` está presente e `Date.now() - unblocked_at < 30 minutos`:

- Borda do card: `border-lime-400`
- Sombra: `shadow-lime-400/40 shadow-lg`
- Badge no topo: `LIBERADO` com `animate-pulse bg-lime-400 text-black`
- Botões de avanço reaparecem normalmente
- Animação some automaticamente após 30 min (sem interação necessária)

---

## 5. Backend — Extensão do RPC `complete_workflow_step`

O RPC `complete_workflow_step` em `00066_workflow_branching.sql` é recriado com `CREATE OR REPLACE` na migration `00068`.

### 5.1 Criação do fork (após criar o próximo step)

Depois de inserir `v_next_step_id`, o RPC verifica:

```sql
IF v_next_tmpl.fork_template_id IS NOT NULL THEN
  -- 1. Cria nova instância no fluxo alvo
  INSERT INTO workflow_instances (template_id, reference, title, status, started_by, metadata)
  SELECT v_next_tmpl.fork_template_id,
         v_instance.reference,
         v_instance.title,
         'running',
         auth.uid(),
         v_instance.metadata
  RETURNING id INTO v_fork_instance_id;

  -- 2. Cria o step de entrada no fluxo fork
  INSERT INTO workflow_steps (instance_id, template_step_id, step_order, assignee_id, assignee_sector_id, status, started_at, due_at)
  SELECT v_fork_instance_id, wts.id, wts.step_order, <resolve_assignee>, wts.assignee_sector_id,
         'in_progress', NOW(), NOW() + (wts.sla_hours || ' hours')::INTERVAL
    FROM workflow_template_steps wts
   WHERE wts.template_id = v_next_tmpl.fork_template_id
     AND wts.step_order = v_next_tmpl.fork_entry_step_order;

  UPDATE workflow_instances SET current_step_id = <fork_entry_step_id>
   WHERE id = v_fork_instance_id;

  -- 3. Bloqueia o step do fluxo original
  UPDATE workflow_steps
     SET status = 'blocked',
         block_reason_code = 'FORK_PENDING',
         blocked_at = NOW(),
         blocked_by = auth.uid(),
         fork_instance_id = v_fork_instance_id
   WHERE id = v_next_step_id;
END IF;
```

### 5.2 Resolução do fork (desbloqueio do original)

Toda vez que um novo step é criado (passo 5.1 ou fluxo normal), o RPC verifica se o step recém-criado é a etapa de resolução de algum fork pendente:

```sql
-- Busca se existe algum step bloqueado por fork que aponta para esta instância
-- e cuja etapa de resolução bate com o título do novo step
SELECT ws.id INTO v_blocked_step_id
  FROM workflow_steps ws
  JOIN workflow_template_steps wts ON wts.id = ws.template_step_id
 WHERE ws.fork_instance_id = v_instance.id
   AND ws.status = 'blocked'
   AND ws.block_reason_code = 'FORK_PENDING'
   AND wts.fork_resolve_step_title = v_next_tmpl.title  -- título do step recém-criado
 LIMIT 1;

IF v_blocked_step_id IS NOT NULL THEN
  -- Desbloqueia o original
  UPDATE workflow_steps
     SET status = 'in_progress',
         block_reason_code = NULL,
         blocked_at = NULL,
         blocked_by = NULL,
         fork_instance_id = NULL,
         unblocked_at = NOW()
   WHERE id = v_blocked_step_id;

  -- Encerra a instância fork
  UPDATE workflow_instances
     SET status = 'completed', completed_at = NOW(), current_step_id = NULL
   WHERE id = v_instance.id;
END IF;
```

### 5.3 Server action `upsertTemplateStepAction`

Estendida para receber e salvar os novos campos:

```typescript
{
  // campos existentes
  id?: string
  template_id: string
  step_order: number
  title: string
  sla_hours: number
  assignee_user_id?: string | null
  assignee_sector_id?: string | null
  // novos
  branch_options?: Array<{ label: string; target_title: string }> | null
  fork_template_id?: string | null
  fork_entry_step_order?: number | null
  fork_resolve_step_title?: string | null
}
```

---

## 6. Arquivos a Criar/Modificar

| Arquivo | Operação |
|---------|----------|
| `squados/supabase/migrations/00068_workflow_fork.sql` | Criar |
| `squados/src/shared/types/database.ts` | Editar — WorkflowTemplateStep + WorkflowStep |
| `squados/src/features/workflows/actions/template-actions.ts` | Editar — upsertTemplateStepAction |
| `squados/src/features/workflows/components/workflow-kanban-column.tsx` | Editar — editor modal |
| `squados/src/features/workflows/components/workflow-kanban-card.tsx` | Editar — botões destino + estados fork |

---

## 7. Fora do Escopo

- Notificação push/DM ao responsável do fluxo fork (pode ser adicionada depois)
- Histórico de forks resolvidos (auditoria futura)
- Múltiplos forks simultâneos por step (uma etapa = um fork configurado)
- Real-time subscription para o desbloqueio (UI detecta via polling no reload do kanban)
