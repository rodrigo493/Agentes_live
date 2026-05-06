# Workflow Fork & Destination Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar seletor visual de etapas de destino e fork de fluxo cruzado com bloqueio/desbloqueio animado no kanban de Operação do SquadOS.

**Architecture:** Migration DB nova adiciona colunas de fork em `workflow_template_steps` e `workflow_steps`. O RPC `complete_workflow_step` é estendido para criar instâncias fork e resolver bloqueios. A UI do editor de coluna ganha dois novos blocos (destinos + fork), e o card exibe botões inline por destino e estados visuais de bloqueio/liberação.

**Tech Stack:** PostgreSQL/Supabase (RPC plpgsql), Next.js App Router server actions, React 18 client components, Tailwind CSS, lucide-react.

**Spec:** `squados/docs/superpowers/specs/2026-05-06-workflow-fork-destination-design.md`

---

## Mapa de Arquivos

| Arquivo | Operação |
|---------|----------|
| `squados/supabase/migrations/00068_workflow_fork.sql` | **Criar** |
| `squados/src/shared/types/database.ts` | Editar — WorkflowTemplateStep + WorkflowStep |
| `squados/src/features/workflows/actions/kanban-actions.ts` | Editar — KanbanColumn, KanbanFlow, query, mapRowToItem |
| `squados/src/features/workflows/actions/pasta-actions.ts` | Editar — WorkItemView, query, mapeamento |
| `squados/src/features/workflows/actions/template-actions.ts` | Editar — upsertTemplateStepAction |
| `squados/src/features/workflows/components/workflow-kanban-board.tsx` | Editar — thread template_steps |
| `squados/src/features/workflows/components/workflow-kanban-column.tsx` | Editar — Bloco A + Bloco B |
| `squados/src/features/workflows/components/workflow-kanban-card.tsx` | Editar — botões inline + estados fork |

---

## Task 1: Migration DB — colunas fork + RPC atualizado

**Files:**
- Create: `squados/supabase/migrations/00068_workflow_fork.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- ============================================================
-- 00068_workflow_fork — destinos de etapa + fork de fluxo
-- ============================================================

-- ── Colunas de fork no template de etapas ────────────────────
ALTER TABLE workflow_template_steps
  ADD COLUMN IF NOT EXISTS fork_template_id        UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fork_entry_step_order   INT,
  ADD COLUMN IF NOT EXISTS fork_resolve_step_title TEXT;

COMMENT ON COLUMN workflow_template_steps.fork_template_id        IS 'Fluxo alvo do fork. NULL = sem fork.';
COMMENT ON COLUMN workflow_template_steps.fork_entry_step_order   IS 'step_order de entrada no fluxo alvo.';
COMMENT ON COLUMN workflow_template_steps.fork_resolve_step_title IS 'Título da etapa do fluxo fork que, ao ser atingida, desbloqueia o original.';

-- ── Colunas de rastreio no step de execução ──────────────────
ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS fork_instance_id UUID REFERENCES workflow_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unblocked_at     TIMESTAMPTZ;

COMMENT ON COLUMN workflow_steps.fork_instance_id IS 'ID da instância fork criada por este step. Usado para rastrear resolução.';
COMMENT ON COLUMN workflow_steps.unblocked_at     IS 'Timestamp do desbloqueio por resolução de fork. Drive da animação LIBERADO na UI.';

-- ── Novo motivo de bloqueio ───────────────────────────────────
INSERT INTO workflow_block_reasons (code, label, category, is_active)
VALUES ('FORK_PENDING', 'Aguardando fluxo paralelo', 'system', true)
ON CONFLICT (code) DO NOTHING;

-- ── RPC atualizado: fork creation + fork resolution ──────────
CREATE OR REPLACE FUNCTION complete_workflow_step(
  p_step_id            UUID,
  p_payload            JSONB DEFAULT '{}'::jsonb,
  p_target_step_title  TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_step                    workflow_steps%ROWTYPE;
  v_next_tmpl               workflow_template_steps%ROWTYPE;
  v_instance                workflow_instances%ROWTYPE;
  v_next_step_id            UUID;
  v_assignee                UUID;
  -- fork creation
  v_fork_tmpl_step          workflow_template_steps%ROWTYPE;
  v_fork_instance_id        UUID;
  v_fork_step_id            UUID;
  v_fork_assignee           UUID;
  -- fork resolution
  v_blocked_step_id         UUID;
  v_fork_resolve_title      TEXT;
BEGIN
  SELECT * INTO v_step FROM workflow_steps WHERE id = p_step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;

  IF v_step.assignee_id <> auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin','master_admin')
     )
  THEN
    RAISE EXCEPTION 'Sem permissão para concluir esta etapa';
  END IF;

  UPDATE workflow_steps
     SET status       = 'done',
         completed_at = NOW(),
         completed_by = auth.uid(),
         payload_data = COALESCE(p_payload, '{}'::jsonb)
   WHERE id = p_step_id;

  UPDATE workflow_inbox_items
     SET status = 'done', handed_off_at = NOW()
   WHERE workflow_step_id = p_step_id;

  SELECT * INTO v_instance FROM workflow_instances WHERE id = v_step.instance_id;

  IF p_target_step_title IS NOT NULL THEN
    SELECT wts.* INTO v_next_tmpl
      FROM workflow_template_steps wts
     WHERE wts.template_id = v_instance.template_id
       AND wts.title = p_target_step_title
     LIMIT 1;
  ELSE
    SELECT wts.* INTO v_next_tmpl
      FROM workflow_template_steps wts
     WHERE wts.template_id = v_instance.template_id
       AND wts.step_order > v_step.step_order
     ORDER BY wts.step_order ASC LIMIT 1;
  END IF;

  -- Sem próxima etapa → fluxo concluído
  IF v_next_tmpl.id IS NULL THEN
    UPDATE workflow_instances
       SET status = 'completed', completed_at = NOW(), current_step_id = NULL
     WHERE id = v_instance.id;

    -- Fallback: verifica se este fluxo fork devia resolver um step bloqueado
    SELECT ws.id INTO v_blocked_step_id
      FROM workflow_steps ws
     WHERE ws.fork_instance_id = v_instance.id
       AND ws.status = 'blocked'
       AND ws.block_reason_code = 'FORK_PENDING'
     LIMIT 1;

    IF v_blocked_step_id IS NOT NULL THEN
      UPDATE workflow_steps
         SET status            = 'in_progress',
             block_reason_code = NULL,
             block_reason_text = NULL,
             blocked_at        = NULL,
             blocked_by        = NULL,
             fork_instance_id  = NULL,
             unblocked_at      = NOW()
       WHERE id = v_blocked_step_id;
    END IF;

    RETURN NULL;
  END IF;

  -- Resolve assignee
  v_assignee := v_next_tmpl.assignee_user_id;
  IF v_assignee IS NULL AND v_next_tmpl.assignee_sector_id IS NOT NULL THEN
    SELECT id INTO v_assignee
      FROM profiles
     WHERE sector_id = v_next_tmpl.assignee_sector_id
       AND status = 'active' AND deleted_at IS NULL
     ORDER BY full_name LIMIT 1;
  END IF;

  -- Cria a próxima etapa de execução
  INSERT INTO workflow_steps (
    instance_id, template_step_id, step_order,
    assignee_id, assignee_sector_id, status,
    started_at, due_at
  ) VALUES (
    v_instance.id, v_next_tmpl.id, v_next_tmpl.step_order,
    v_assignee, v_next_tmpl.assignee_sector_id, 'in_progress',
    NOW(), NOW() + (v_next_tmpl.sla_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO v_next_step_id;

  UPDATE workflow_instances
     SET current_step_id = v_next_step_id
   WHERE id = v_instance.id;

  -- ── FORK CREATION ──────────────────────────────────────────
  IF v_next_tmpl.fork_template_id IS NOT NULL THEN
    SELECT * INTO v_fork_tmpl_step
      FROM workflow_template_steps
     WHERE template_id = v_next_tmpl.fork_template_id
       AND step_order  = v_next_tmpl.fork_entry_step_order
     LIMIT 1;

    IF v_fork_tmpl_step.id IS NOT NULL THEN
      v_fork_assignee := v_fork_tmpl_step.assignee_user_id;
      IF v_fork_assignee IS NULL AND v_fork_tmpl_step.assignee_sector_id IS NOT NULL THEN
        SELECT id INTO v_fork_assignee
          FROM profiles
         WHERE sector_id = v_fork_tmpl_step.assignee_sector_id
           AND status = 'active' AND deleted_at IS NULL
         ORDER BY full_name LIMIT 1;
      END IF;

      INSERT INTO workflow_instances (template_id, reference, title, status, started_by, metadata)
      VALUES (
        v_next_tmpl.fork_template_id,
        v_instance.reference,
        v_instance.title,
        'running',
        auth.uid(),
        v_instance.metadata
      )
      RETURNING id INTO v_fork_instance_id;

      INSERT INTO workflow_steps (
        instance_id, template_step_id, step_order,
        assignee_id, assignee_sector_id, status,
        started_at, due_at
      ) VALUES (
        v_fork_instance_id, v_fork_tmpl_step.id, v_fork_tmpl_step.step_order,
        v_fork_assignee, v_fork_tmpl_step.assignee_sector_id, 'in_progress',
        NOW(), NOW() + (v_fork_tmpl_step.sla_hours || ' hours')::INTERVAL
      )
      RETURNING id INTO v_fork_step_id;

      UPDATE workflow_instances
         SET current_step_id = v_fork_step_id
       WHERE id = v_fork_instance_id;

      UPDATE workflow_steps
         SET status            = 'blocked',
             block_reason_code = 'FORK_PENDING',
             blocked_at        = NOW(),
             blocked_by        = auth.uid(),
             fork_instance_id  = v_fork_instance_id
       WHERE id = v_next_step_id;
    END IF;
  END IF;

  -- ── FORK RESOLUTION ────────────────────────────────────────
  -- O step recém-criado pode ser a etapa de resolução de um fork pendente
  SELECT ws.id INTO v_blocked_step_id
    FROM workflow_steps ws
   WHERE ws.fork_instance_id = v_instance.id
     AND ws.status = 'blocked'
     AND ws.block_reason_code = 'FORK_PENDING'
   LIMIT 1;

  IF v_blocked_step_id IS NOT NULL THEN
    SELECT wts.fork_resolve_step_title INTO v_fork_resolve_title
      FROM workflow_template_steps wts
      JOIN workflow_steps ws_b ON ws_b.template_step_id = wts.id
     WHERE ws_b.id = v_blocked_step_id;

    IF v_fork_resolve_title IS NOT NULL AND v_fork_resolve_title = v_next_tmpl.title THEN
      UPDATE workflow_steps
         SET status            = 'in_progress',
             block_reason_code = NULL,
             block_reason_text = NULL,
             blocked_at        = NULL,
             blocked_by        = NULL,
             fork_instance_id  = NULL,
             unblocked_at      = NOW()
       WHERE id = v_blocked_step_id;

      UPDATE workflow_instances
         SET status = 'completed', completed_at = NOW(), current_step_id = NULL
       WHERE id = v_instance.id;
    END IF;
  END IF;

  RETURN v_next_step_id;
END;
$$;
```

- [ ] **Step 2: Aplicar migration no Supabase local**

```bash
cd squados
npx supabase db push
```

Esperado: migration `00068_workflow_fork` listada como aplicada. Sem erros.

- [ ] **Step 3: Verificar colunas novas**

```bash
npx supabase db diff
```

Esperado: sem diff pendente (tudo aplicado).

- [ ] **Step 4: Commit**

```bash
git add squados/supabase/migrations/00068_workflow_fork.sql
git commit -m "feat(db): migration 00068 — fork de fluxo cruzado + colunas de destino"
```

---

## Task 2: Tipos TypeScript — database.ts

**Files:**
- Modify: `squados/src/shared/types/database.ts:396-444`

- [ ] **Step 1: Atualizar `WorkflowTemplateStep`**

Localizar a interface `WorkflowTemplateStep` (linha ~396) e substituir por:

```typescript
export interface WorkflowTemplateStep {
  id: string;
  template_id: string;
  step_order: number;
  title: string;
  description: string | null;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
  sla_hours: number;
  payload_schema: Record<string, unknown>;
  branch_options: Array<{ label: string; target_title: string }> | null;
  complete_label: string | null;
  fork_template_id: string | null;
  fork_entry_step_order: number | null;
  fork_resolve_step_title: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Atualizar `WorkflowStep`**

Localizar a interface `WorkflowStep` (linha ~426) e substituir por:

```typescript
export interface WorkflowStep {
  id: string;
  instance_id: string;
  template_step_id: string;
  step_order: number;
  assignee_id: string | null;
  assignee_sector_id: string | null;
  status: WorkflowStepStatus;
  started_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  payload_data: Record<string, unknown>;
  block_reason_code: string | null;
  block_reason_text: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
  fork_instance_id: string | null;
  unblocked_at: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Verificar typecheck**

```bash
cd squados && npm run typecheck 2>&1 | head -30
```

Esperado: sem erros nos tipos de database.

- [ ] **Step 4: Commit**

```bash
git add squados/src/shared/types/database.ts
git commit -m "feat(types): WorkflowTemplateStep + WorkflowStep com campos fork"
```

---

## Task 3: kanban-actions.ts — tipos, query e mapping

**Files:**
- Modify: `squados/src/features/workflows/actions/kanban-actions.ts`

- [ ] **Step 1: Adicionar campos fork a `KanbanColumn`**

Localizar a interface `KanbanColumn` (linha ~8) e substituir por:

```typescript
export interface KanbanColumn {
  template_step_id: string;
  template_id: string;
  step_order: number;
  step_title: string;
  sla_hours: number;
  assignee_name: string | null;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
  branch_options: Array<{ label: string; target_title: string }> | null;
  fork_template_id: string | null;
  fork_entry_step_order: number | null;
  fork_resolve_step_title: string | null;
  items: WorkItemView[];
}
```

- [ ] **Step 2: Adicionar `template_steps` a `KanbanFlow`**

Localizar a interface `KanbanFlow` (linha ~20) e substituir por:

```typescript
export interface KanbanFlow {
  template_id: string;
  template_name: string;
  template_color: string;
  columns: KanbanColumn[];
  template_steps: Array<{ id: string; step_order: number; title: string }>;
  overdue_count: number;
}
```

- [ ] **Step 3: Atualizar `TplStepRow` com campos fork**

Localizar `type TplStepRow` (linha ~47) e substituir por:

```typescript
type TplStepRow = {
  id: string;
  step_order: number;
  title: string;
  sla_hours: number;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
  branch_options: Array<{ label: string; target_title: string }> | null;
  complete_label: string | null;
  fork_template_id: string | null;
  fork_entry_step_order: number | null;
  fork_resolve_step_title: string | null;
};
```

- [ ] **Step 4: Atualizar `RawStepRow` com campos fork**

Localizar `type RawStepRow` (linha ~35) e substituir por:

```typescript
type RawStepRow = {
  id: string;
  instance_id: string;
  status: string;
  due_at: string | null;
  started_at: string | null;
  assignee_id: string;
  notes: unknown;
  block_reason_code: string | null;
  unblocked_at: string | null;
  instance: unknown;
  template_step: unknown;
};
```

- [ ] **Step 5: Atualizar `mapRowToItem` para incluir block_reason_code e unblocked_at**

Na função `mapRowToItem`, adicionar os campos novos no objeto retornado. Localizar o `return {` (linha ~82) e adicionar após `posvenda_notes`:

```typescript
  block_reason_code: s.block_reason_code ?? null,
  unblocked_at: s.unblocked_at ?? null,
```

- [ ] **Step 6: Atualizar queries de `workflow_steps` para incluir novos campos**

Em `getUserKanbanAction`, localizar a linha do `.select(`` que contém `id, instance_id, status, due_at, started_at, assignee_id, notes,` e substituir por:

```
id, instance_id, status, due_at, started_at, assignee_id, notes,
block_reason_code, unblocked_at,
```

Fazer o mesmo em `getAdminKanbanAction` na mesma posição.

- [ ] **Step 7: Atualizar select de templates em `getAdminKanbanAction` para incluir fork fields**

Localizar a linha (linha ~237):
```typescript
.select('id, name, color, workflow_template_steps(id, step_order, title, sla_hours, assignee_user_id, assignee_sector_id)')
```

Substituir por:
```typescript
.select('id, name, color, workflow_template_steps(id, step_order, title, sla_hours, assignee_user_id, assignee_sector_id, branch_options, fork_template_id, fork_entry_step_order, fork_resolve_step_title)')
```

- [ ] **Step 8: Atualizar construção de `columns` em `getAdminKanbanAction` para incluir fork fields**

Localizar o `const columns: KanbanColumn[] = tplSteps.map((ts) => ({` (linha ~311) e substituir o objeto mapeado por:

```typescript
const columns: KanbanColumn[] = tplSteps.map((ts) => ({
  template_step_id:      ts.id,
  template_id:           t.id,
  step_order:            ts.step_order,
  step_title:            ts.title,
  sla_hours:             Number(ts.sla_hours),
  assignee_name:         ts.assignee_user_id ? (assigneeMap.get(ts.assignee_user_id) ?? null) : null,
  assignee_user_id:      ts.assignee_user_id,
  assignee_sector_id:    ts.assignee_sector_id,
  branch_options:        ts.branch_options ?? null,
  fork_template_id:      (ts as TplStepRow).fork_template_id ?? null,
  fork_entry_step_order: (ts as TplStepRow).fork_entry_step_order ?? null,
  fork_resolve_step_title: (ts as TplStepRow).fork_resolve_step_title ?? null,
  items:                 templateItems.filter((i) => i.step_order === ts.step_order),
}));
```

- [ ] **Step 9: Adicionar `template_steps` ao `KanbanFlow` retornado em `getAdminKanbanAction`**

Localizar o `return {` dentro do `visibleTemplates.map((t) => {` (linha ~307) e adicionar `template_steps` ao objeto final:

```typescript
return {
  template_id:    t.id,
  template_name:  t.name,
  template_color: t.color ?? '#6366f1',
  columns,
  template_steps: tplSteps.map((ts) => ({ id: ts.id, step_order: ts.step_order, title: ts.title })),
  overdue_count:  overdueCount,
};
```

- [ ] **Step 10: Adicionar `template_steps: []` ao KanbanFlow em `getUserKanbanAction`**

Na função `getUserKanbanAction`, localizar onde `flowMap.set` é chamado (linha ~171) e adicionar `template_steps: []` ao objeto:

```typescript
flowMap.set(item.template_id, {
  template_id:    item.template_id,
  template_name:  item.template_name,
  template_color: item.template_color,
  columns:        [],
  template_steps: [],
  overdue_count:  0,
});
```

- [ ] **Step 11: Verificar typecheck**

```bash
cd squados && npm run typecheck 2>&1 | head -40
```

Esperado: erros apenas em arquivos ainda não atualizados (pasta-actions, card, column).

- [ ] **Step 12: Commit**

```bash
git add squados/src/features/workflows/actions/kanban-actions.ts
git commit -m "feat(kanban-actions): fork fields em KanbanColumn/KanbanFlow, query atualizada"
```

---

## Task 4: pasta-actions.ts — WorkItemView + query

**Files:**
- Modify: `squados/src/features/workflows/actions/pasta-actions.ts`

- [ ] **Step 1: Adicionar `block_reason_code` e `unblocked_at` a `WorkItemView`**

Localizar a interface `WorkItemView` (linha ~23) e adicionar após `posvenda_notes`:

```typescript
  block_reason_code: string | null;
  unblocked_at: string | null;
```

- [ ] **Step 2: Adicionar campos na query de `workflow_steps` em `getPastaViewAction`**

Localizar a linha com `.select(`` (linha ~66) que contém `id, instance_id, status, due_at, started_at, assignee_id, notes,` e substituir por:

```
id, instance_id, status, due_at, started_at, assignee_id, notes,
block_reason_code, unblocked_at,
```

- [ ] **Step 3: Incluir os novos campos no mapeamento de items**

Localizar o `items.push({` (linha ~124) e adicionar após `posvenda_notes`:

```typescript
      block_reason_code: (s as any).block_reason_code ?? null,
      unblocked_at: (s as any).unblocked_at ?? null,
```

- [ ] **Step 4: Verificar typecheck**

```bash
cd squados && npm run typecheck 2>&1 | head -40
```

Esperado: erros apenas nos componentes ainda não atualizados.

- [ ] **Step 5: Commit**

```bash
git add squados/src/features/workflows/actions/pasta-actions.ts
git commit -m "feat(pasta-actions): WorkItemView com block_reason_code + unblocked_at"
```

---

## Task 5: template-actions.ts — upsertTemplateStepAction com fork fields

**Files:**
- Modify: `squados/src/features/workflows/actions/template-actions.ts:177-227`

- [ ] **Step 1: Atualizar assinatura e corpo de `upsertTemplateStepAction`**

Substituir toda a função `upsertTemplateStepAction` (linha 177–227) por:

```typescript
export async function upsertTemplateStepAction(data: {
  id?: string;
  template_id: string;
  step_order: number;
  title: string;
  description?: string | null;
  assignee_user_id?: string | null;
  assignee_sector_id?: string | null;
  sla_hours: number;
  branch_options?: Array<{ label: string; target_title: string }> | null;
  fork_template_id?: string | null;
  fork_entry_step_order?: number | null;
  fork_resolve_step_title?: string | null;
}): Promise<{ step?: WorkflowTemplateStep; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const payload = {
      step_order:              data.step_order,
      title:                   data.title.trim(),
      description:             data.description?.toString().trim() || null,
      assignee_user_id:        data.assignee_user_id || null,
      assignee_sector_id:      data.assignee_sector_id || null,
      sla_hours:               data.sla_hours,
      branch_options:          data.branch_options ?? null,
      fork_template_id:        data.fork_template_id || null,
      fork_entry_step_order:   data.fork_entry_step_order ?? null,
      fork_resolve_step_title: data.fork_resolve_step_title || null,
    };

    if (data.id) {
      const { data: s, error } = await admin
        .from('workflow_template_steps')
        .update(payload)
        .eq('id', data.id)
        .select()
        .single();
      if (error) return { error: error.message };
      return { step: s as WorkflowTemplateStep };
    }

    const { data: s, error } = await admin
      .from('workflow_template_steps')
      .insert({ template_id: data.template_id, ...payload })
      .select()
      .single();
    if (error) return { error: error.message };
    return { step: s as WorkflowTemplateStep };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd squados && npm run typecheck 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/actions/template-actions.ts
git commit -m "feat(template-actions): upsertTemplateStepAction aceita branch_options e fork fields"
```

---

## Task 6: workflow-kanban-board.tsx — thread template_steps

**Files:**
- Modify: `squados/src/features/workflows/components/workflow-kanban-board.tsx`

- [ ] **Step 1: Passar `allSteps` e `allTemplates` para cada `KanbanColumn`**

O `KanbanBoard` recebe `flow: KanbanFlow` que agora tem `template_steps`. Adicionar `allTemplates` como prop opcional. Substituir o arquivo inteiro por:

```typescript
'use client';

import { useRef } from 'react';
import { KanbanColumn } from './workflow-kanban-column';
import type { KanbanFlow } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import type { Sector, Profile, WorkflowTemplateFull } from '@/shared/types/database';

interface Props {
  flow: KanbanFlow;
  allTemplates?: WorkflowTemplateFull[];
  showAssignee?: boolean;
  isAdmin?: boolean;
  users?: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  sectors?: Sector[];
  onAdvance: (stepId: string, targetStepTitle?: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
  onColumnSaved?: () => void;
}

export function KanbanBoard({
  flow, allTemplates = [], showAssignee, isAdmin, users, sectors,
  onAdvance, onOpenNotes, onColumnSaved,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    dragging.current = true;
    startX.current = e.pageX - (boardRef.current?.offsetLeft ?? 0);
    scrollLeft.current = boardRef.current?.scrollLeft ?? 0;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    e.preventDefault();
    const x = e.pageX - (boardRef.current?.offsetLeft ?? 0);
    if (boardRef.current) boardRef.current.scrollLeft = scrollLeft.current - (x - startX.current) * 1.2;
  }
  function stopDrag() { dragging.current = false; }

  if (flow.columns.length === 0) {
    return (
      <div className="text-sm text-zinc-500 py-8 text-center border border-zinc-800 rounded-xl bg-zinc-900">
        Este fluxo não possui etapas configuradas.
      </div>
    );
  }

  return (
    <div
      ref={boardRef}
      className="flex gap-3 overflow-x-auto pb-3 pt-1 cursor-grab active:cursor-grabbing select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      {flow.columns.map((col, idx) => (
        <div key={col.template_step_id} className="flex items-start gap-3">
          <KanbanColumn
            column={col}
            columnIndex={idx}
            templateName={flow.template_name}
            allSteps={flow.template_steps}
            allTemplates={allTemplates}
            showAssignee={showAssignee}
            isAdmin={isAdmin}
            users={users}
            sectors={sectors}
            onAdvance={onAdvance}
            onOpenNotes={onOpenNotes}
            onColumnSaved={onColumnSaved}
          />
          {idx < flow.columns.length - 1 && (
            <div className="text-zinc-700 text-lg mt-8 flex-shrink-0">›</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que `WorkflowTemplateFull` está exportado em database.ts**

```bash
cd squados && grep -n "WorkflowTemplateFull" src/shared/types/database.ts
```

Esperado: linha com `export interface WorkflowTemplateFull`.

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-kanban-board.tsx
git commit -m "feat(kanban-board): thread allSteps + allTemplates para KanbanColumn"
```

---

## Task 7: workflow-kanban-column.tsx — Bloco A + Bloco B

**Files:**
- Modify: `squados/src/features/workflows/components/workflow-kanban-column.tsx`

- [ ] **Step 1: Substituir o arquivo completo**

```typescript
'use client';

import { useState } from 'react';
import { Pencil, Check, X, Plus, GitFork, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { upsertTemplateStepAction } from '../actions/template-actions';
import { listTemplatesAction } from '../actions/template-actions';
import { KanbanCard } from './workflow-kanban-card';
import { NewCardSheet } from './new-card-sheet';
import type { KanbanColumn as KanbanColumnData } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import type { Sector, Profile, WorkflowTemplateFull } from '@/shared/types/database';

const STEP_COLORS = [
  '#94a3b8','#f97316','#3b82f6','#ec4899','#14b8a6',
  '#22c55e','#a855f7','#eab308','#ef4444','#06b6d4',
];

interface Props {
  column: KanbanColumnData;
  columnIndex?: number;
  templateName: string;
  allSteps?: Array<{ id: string; step_order: number; title: string }>;
  allTemplates?: WorkflowTemplateFull[];
  showAssignee?: boolean;
  isAdmin?: boolean;
  users?: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  sectors?: Sector[];
  onAdvance: (stepId: string, targetStepTitle?: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
  onColumnSaved?: () => void;
}

export function KanbanColumn({
  column, columnIndex = 0, templateName, allSteps = [], allTemplates = [],
  showAssignee, isAdmin, users = [], sectors = [],
  onAdvance, onOpenNotes, onColumnSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCardOpen, setNewCardOpen] = useState(false);

  // Campos básicos
  const [title, setTitle] = useState(column.step_title);
  const [sla, setSla] = useState(column.sla_hours);
  const [assigneeUserId, setAssigneeUserId] = useState(column.assignee_user_id ?? '');
  const [assigneeSectorId, setAssigneeSectorId] = useState(column.assignee_sector_id ?? '');

  // Bloco A — destinos
  const initialDestinations = (column.branch_options ?? []).map((b) => b.target_title);
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>(initialDestinations);

  // Bloco B — fork
  const [forkOpen, setForkOpen] = useState(false);
  const [forkTemplateId, setForkTemplateId] = useState<string | null>(column.fork_template_id);
  const [forkEntryStepOrder, setForkEntryStepOrder] = useState<number | null>(column.fork_entry_step_order);
  const [forkResolveStepTitle, setForkResolveStepTitle] = useState<string | null>(column.fork_resolve_step_title);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [forkTemplates, setForkTemplates] = useState<WorkflowTemplateFull[]>(allTemplates);

  const accentColor = STEP_COLORS[columnIndex % STEP_COLORS.length];
  const otherSteps = allSteps.filter((s) => s.step_order !== column.step_order);

  async function loadForkTemplates() {
    if (forkTemplates.length > 0) return;
    setLoadingTemplates(true);
    try {
      const r = await listTemplatesAction();
      if (r.templates) setForkTemplates(r.templates);
    } finally {
      setLoadingTemplates(false);
    }
  }

  function handleForkOpen() {
    setForkOpen((prev) => {
      if (!prev) loadForkTemplates();
      return !prev;
    });
  }

  async function handleSave() {
    if (!title.trim()) return toast.error('Título obrigatório');
    setSaving(true);
    try {
      // Converte selectedDestinations em branch_options
      const branch_options = selectedDestinations.length > 0
        ? selectedDestinations.map((t) => ({ label: t, target_title: t }))
        : null;

      const r = await upsertTemplateStepAction({
        id: column.template_step_id,
        template_id: column.template_id,
        step_order: column.step_order,
        title: title.trim(),
        sla_hours: sla,
        assignee_user_id: assigneeUserId || null,
        assignee_sector_id: assigneeSectorId || null,
        branch_options,
        fork_template_id: forkTemplateId || null,
        fork_entry_step_order: forkEntryStepOrder ?? null,
        fork_resolve_step_title: forkResolveStepTitle || null,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Etapa salva');
      setEditing(false);
      onColumnSaved?.();
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setTitle(column.step_title);
    setSla(column.sla_hours);
    setAssigneeUserId(column.assignee_user_id ?? '');
    setAssigneeSectorId(column.assignee_sector_id ?? '');
    setSelectedDestinations(initialDestinations);
    setForkTemplateId(column.fork_template_id);
    setForkEntryStepOrder(column.fork_entry_step_order);
    setForkResolveStepTitle(column.fork_resolve_step_title);
    setForkOpen(false);
    setEditing(false);
  }

  const selectedForkTemplate = forkTemplates.find((t) => t.id === forkTemplateId);
  const forkSteps = selectedForkTemplate?.steps ?? [];

  return (
    <div
      className="flex flex-col w-[245px] flex-shrink-0 rounded-xl bg-zinc-900/70 border border-zinc-700/50 overflow-hidden shadow-md"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      {/* Header */}
      {editing ? (
        <div className="px-3 py-2.5 border-b border-zinc-700/50 space-y-2 bg-zinc-900 max-h-[70vh] overflow-y-auto">
          {/* Título */}
          <input
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da etapa"
          />

          {/* SLA */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <div className="text-[9px] text-zinc-500 mb-1">SLA (horas)</div>
              <input
                type="number" min={1}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                value={sla}
                onChange={(e) => setSla(Number(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* Responsável */}
          <div>
            <div className="text-[9px] text-zinc-500 mb-1">Responsável (usuário)</div>
            <select
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
            >
              <option value="">— nenhum —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500 mb-1">Setor (combinável)</div>
            <select
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              value={assigneeSectorId}
              onChange={(e) => setAssigneeSectorId(e.target.value)}
            >
              <option value="">— nenhum —</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* ── Bloco A: Etapas de destino ── */}
          <div className="border-t border-zinc-700/50 pt-2">
            <div className="text-[9px] text-zinc-500 mb-1.5 font-medium uppercase tracking-wide">
              Etapas de destino
            </div>
            {otherSteps.length === 0 ? (
              <p className="text-[10px] text-zinc-600 italic">Nenhuma outra etapa neste fluxo</p>
            ) : (
              <div className="space-y-1 max-h-[120px] overflow-y-auto pr-0.5">
                {otherSteps.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      className="rounded border-zinc-600 bg-zinc-800 accent-violet-500 w-3 h-3"
                      checked={selectedDestinations.includes(s.title)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDestinations((prev) => [...prev, s.title]);
                        } else {
                          setSelectedDestinations((prev) => prev.filter((t) => t !== s.title));
                        }
                      }}
                    />
                    <span className="text-[11px] text-zinc-300 group-hover:text-white leading-tight">
                      {s.step_order}. {s.title}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {selectedDestinations.length > 0 && (
              <p className="text-[9px] text-violet-400 mt-1">
                {selectedDestinations.length} destino{selectedDestinations.length > 1 ? 's' : ''} selecionado{selectedDestinations.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* ── Bloco B: Fork de fluxo ── */}
          <div className="border-t border-zinc-700/50 pt-2">
            <button
              type="button"
              onClick={handleForkOpen}
              className="flex items-center gap-1.5 text-[9px] font-medium text-zinc-400 hover:text-zinc-200 uppercase tracking-wide w-full"
            >
              <GitFork className="w-3 h-3" />
              Fork de fluxo
              {forkTemplateId && <span className="ml-1 text-violet-400">● configurado</span>}
              <span className="ml-auto">
                {forkOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </span>
            </button>

            {forkOpen && (
              <div className="mt-2 space-y-2 bg-zinc-800/50 rounded-lg p-2.5 border border-zinc-700/50">
                <div>
                  <div className="text-[9px] text-zinc-500 mb-1">Fluxo de destino</div>
                  {loadingTemplates ? (
                    <p className="text-[10px] text-zinc-500 italic">Carregando fluxos…</p>
                  ) : (
                    <select
                      className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      value={forkTemplateId ?? ''}
                      onChange={(e) => {
                        setForkTemplateId(e.target.value || null);
                        setForkEntryStepOrder(null);
                        setForkResolveStepTitle(null);
                      }}
                    >
                      <option value="">— Nenhum —</option>
                      {forkTemplates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {forkTemplateId && forkSteps.length > 0 && (
                  <>
                    <div>
                      <div className="text-[9px] text-zinc-500 mb-1">Etapa de entrada</div>
                      <select
                        className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                        value={forkEntryStepOrder ?? ''}
                        onChange={(e) => setForkEntryStepOrder(Number(e.target.value) || null)}
                      >
                        <option value="">— selecione —</option>
                        {forkSteps.map((s) => (
                          <option key={s.id} value={s.step_order}>
                            {s.step_order}. {s.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-500 mb-1">Etapa de resolução</div>
                      <select
                        className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                        value={forkResolveStepTitle ?? ''}
                        onChange={(e) => setForkResolveStepTitle(e.target.value || null)}
                      >
                        <option value="">— selecione —</option>
                        {forkSteps.map((s) => (
                          <option key={s.id} value={s.title}>
                            {s.step_order}. {s.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Botões salvar/cancelar */}
          <div className="flex gap-1.5 pt-0.5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-semibold disabled:opacity-50 transition-colors"
            >
              <Check className="w-3 h-3" /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              onClick={handleCancel}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2.5 flex items-center gap-2 border-b border-zinc-700/40 group/header">
          <span className="text-xs font-bold flex-1 truncate" style={{ color: accentColor }}>
            {column.step_title}
          </span>
          <span className="text-[10px] font-semibold bg-zinc-700/60 text-zinc-300 rounded-full px-1.5 py-0.5 min-w-[20px] text-center shrink-0">
            {column.items.length}
          </span>
          {isAdmin && (
            <button
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover/header:opacity-100 text-zinc-500 hover:text-zinc-300 transition-all shrink-0"
              title="Editar etapa"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 max-h-[62vh]">
        {column.items.length === 0 ? (
          <div className="text-[11px] text-zinc-600 text-center py-10 font-medium">vazio</div>
        ) : (
          column.items.map((item) => (
            <KanbanCard
              key={item.step_id}
              item={item}
              showAssignee={showAssignee}
              isAdmin={isAdmin}
              onAdvance={onAdvance}
              onOpenNotes={onOpenNotes}
              onDeleted={onColumnSaved}
            />
          ))
        )}
      </div>

      {/* Novo card (admin) */}
      {isAdmin && (
        <div className="px-2 pb-2">
          <button
            onClick={() => setNewCardOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-zinc-700 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400 text-[11px] font-medium transition-colors"
          >
            <Plus className="w-3 h-3" /> Novo card
          </button>
        </div>
      )}

      <NewCardSheet
        open={newCardOpen}
        templateId={column.template_id}
        templateName={templateName}
        users={users}
        onClose={() => setNewCardOpen(false)}
        onCreated={() => { setNewCardOpen(false); onColumnSaved?.(); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd squados && npm run typecheck 2>&1 | head -40
```

Esperado: erros apenas em workflow-kanban-card.tsx (ainda não atualizado).

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-kanban-column.tsx
git commit -m "feat(kanban-column): Bloco A destinos + Bloco B fork de fluxo no editor"
```

---

## Task 8: workflow-kanban-card.tsx — botões inline + estados fork

**Files:**
- Modify: `squados/src/features/workflows/components/workflow-kanban-card.tsx`

- [ ] **Step 1: Substituir o arquivo completo**

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Trash2, Loader2, TriangleAlert, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteWorkItemAction } from '../actions/pasta-actions';
import type { WorkItemView, BranchOption } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView;
  showAssignee?: boolean;
  isAdmin?: boolean;
  onAdvance: (stepId: string, targetStepTitle?: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
  onDeleted?: () => void;
}

function computeSlaState(item: WorkItemView) {
  if (!item.due_at) return { label: '—', state: 'none' as const };
  const now = Date.now();
  const dueMs = new Date(item.due_at).getTime();
  const diffMs = dueMs - now;
  const slaMs = item.sla_hours * 3_600_000;
  if (diffMs < 0) {
    const h = Math.floor(Math.abs(diffMs) / 3_600_000);
    const m = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
    return { label: `${h}h${m > 0 ? `${m}m` : ''}`, state: 'overdue' as const };
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffMs / slaMs <= 0.5) return { label: `${h}h${m > 0 ? `${m}m` : ''}`, state: 'warning' as const };
  return { label: `${h}h${m > 0 ? `${m}m` : ''}`, state: 'ok' as const };
}

function SlaChip({ sla }: { sla: ReturnType<typeof computeSlaState> }) {
  if (sla.state === 'none') return null;
  if (sla.state === 'overdue') return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
      🔥 Esfriando {sla.label}
    </span>
  );
  if (sla.state === 'warning') return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
      🔥 Esfriando {sla.label}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      ✓ {sla.label}
    </span>
  );
}

function ObservacoesCardButton({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold text-amber-900 transition-all hover:brightness-110"
        style={{
          background: 'linear-gradient(135deg, #fef08a 0%, #fde047 100%)',
          border: '1.5px solid #f97316',
          animation: 'obs-border-pulse 1.8s ease-in-out infinite',
        }}
      >
        <TriangleAlert className="h-3 w-3 shrink-0 text-orange-500" style={{ filter: 'drop-shadow(0 0 3px #f97316)' }} />
        Obs. Pós-Venda
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-orange-500" style={{ animation: 'obs-dot-pulse 1.8s ease-in-out infinite', boxShadow: '0 0 4px #f97316' }} />
      </button>
      <style>{`
        @keyframes obs-border-pulse {
          0%, 100% { box-shadow: 0 0 4px 1px rgba(249,115,22,0.5); border-color: #f97316; }
          50% { box-shadow: 0 0 10px 3px rgba(249,115,22,0.85); border-color: #fb923c; }
        }
        @keyframes obs-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative w-full max-w-md rounded-2xl border-2 border-amber-400 bg-zinc-900 shadow-2xl p-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-900/40">
                <TriangleAlert className="h-5 w-5 text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-zinc-100">Observações do Pós-Venda</h3>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{notes}</p>
          </div>
        </div>
      )}
    </>
  );
}

export function KanbanCard({ item, showAssignee, isAdmin, onAdvance, onOpenNotes, onDeleted }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sla = computeSlaState(item);

  const branches = item.branch_options;
  const isForkBlocked = item.block_reason_code === 'FORK_PENDING';
  const isUnblocked = !!item.unblocked_at &&
    (Date.now() - new Date(item.unblocked_at).getTime() < 30 * 60 * 1000);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Excluir card "${item.reference}"? Todas as etapas e anexos serão removidos.`)) return;
    setDeleting(true);
    try {
      const r = await deleteWorkItemAction(item.instance_id);
      if (r.error) { toast.error(r.error); return; }
      toast.success(`Card ${item.reference} excluído`);
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  async function handleAdvanceDirect(targetTitle?: string) {
    setAdvancing(true);
    try { await onAdvance(item.step_id, targetTitle); } finally { setAdvancing(false); }
  }

  function renderAdvanceArea() {
    if (advancing) return (
      <Button size="sm" variant="ghost" disabled className="flex-1 h-7 text-[11px] font-semibold px-2">
        <Loader2 className="w-3 h-3 animate-spin" />
      </Button>
    );

    if (isForkBlocked) return (
      <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 flex-1">
        <Clock className="w-3 h-3 text-amber-400 shrink-0" />
        <span className="text-[10px] text-amber-300 font-medium">Aguardando fluxo paralelo</span>
      </div>
    );

    if (branches && branches.length > 0) return (
      <div className="flex gap-1 flex-wrap flex-1">
        {branches.map((b: BranchOption) => (
          <Button
            key={b.target_title}
            size="sm"
            variant="ghost"
            disabled={advancing}
            className="h-7 text-[11px] font-semibold px-2 gap-1 text-zinc-300 hover:text-white hover:bg-zinc-700/80 flex-1 min-w-0"
            onClick={() => handleAdvanceDirect(b.target_title)}
          >
            <ChevronRight className="w-3 h-3 shrink-0" />
            <span className="truncate">{b.label}</span>
          </Button>
        ))}
      </div>
    );

    if (item.next_step_title) return (
      <Button
        size="sm" variant="ghost"
        className="flex-1 h-7 text-[11px] font-semibold px-2 gap-1 text-zinc-300 hover:text-white hover:bg-zinc-700/80"
        onClick={() => handleAdvanceDirect()}
      >
        <ChevronRight className="w-3 h-3" />{item.next_step_title}
      </Button>
    );

    return (
      <Button
        size="sm" variant="ghost"
        className="flex-1 h-7 text-[11px] font-semibold px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30"
        onClick={() => handleAdvanceDirect()}
      >
        ✓ {item.complete_label ?? 'Concluir'}
      </Button>
    );
  }

  return (
    <>
      {isUnblocked && (
        <style>{`
          @keyframes liberated-glow {
            0%, 100% { box-shadow: 0 0 6px 2px rgba(163,230,53,0.3); border-color: rgba(163,230,53,0.5); }
            50% { box-shadow: 0 0 16px 5px rgba(163,230,53,0.65); border-color: rgba(163,230,53,0.9); }
          }
        `}</style>
      )}
      <div
        className={`rounded-xl border p-3 space-y-2 shadow-sm transition-colors ${
          isUnblocked
            ? 'border-lime-400/50 bg-zinc-800/80'
            : 'border-zinc-700/70 bg-zinc-800/80 hover:border-zinc-600/80'
        }`}
        style={isUnblocked ? { animation: 'liberated-glow 1.5s ease-in-out infinite' } : {}}
      >
        {/* Badge LIBERADO */}
        {isUnblocked && (
          <div className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1 bg-lime-400/15 border border-lime-400/40 animate-pulse">
            <span className="text-[11px] font-bold text-lime-400 tracking-widest">✓ LIBERADO</span>
          </div>
        )}

        {/* Linha de status + SLA */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            <span className="text-[10px] text-zinc-500">Em andamento</span>
          </div>
          <div className="flex items-center gap-1">
            <SlaChip sla={sla} />
            {isAdmin && (
              <Button
                size="sm" variant="ghost"
                className="h-5 w-5 p-0 text-zinc-600 hover:text-red-400 hover:bg-red-900/20"
                onClick={handleDelete}
                disabled={deleting}
                title="Excluir card"
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </Button>
            )}
          </div>
        </div>

        {/* Título + responsável */}
        <Link href={`/operations/card/${item.step_id}`} target="_blank" className="block group">
          <p className="text-[13px] font-bold text-zinc-100 leading-snug group-hover:text-white">
            {item.reference}
          </p>
          {showAssignee && item.assignee_name && (
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{item.assignee_name}</p>
          )}
        </Link>

        {/* Obs. Pós-Venda */}
        {item.posvenda_notes && (
          <ObservacoesCardButton notes={item.posvenda_notes} />
        )}

        {/* Ações */}
        <div className="flex gap-1 pt-1 border-t border-zinc-700/40">
          {renderAdvanceArea()}
          {!isForkBlocked && (
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/80 shrink-0"
              onClick={() => onOpenNotes(item)}
              title="Notas"
            >
              <FileText className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd squados && npm run typecheck 2>&1 | head -40
```

Esperado: zero erros de tipo.

- [ ] **Step 3: Verificar build**

```bash
cd squados && npm run build 2>&1 | tail -20
```

Esperado: build bem-sucedido sem erros de compilação.

- [ ] **Step 4: Commit final**

```bash
git add squados/src/features/workflows/components/workflow-kanban-card.tsx
git commit -m "feat(kanban-card): botões inline de destino + estados FORK_PENDING e LIBERADO"
```

---

## Checklist de Self-Review

- [x] **Task 1** cobre migration DB com colunas fork + novo block reason + RPC estendido
- [x] **Task 2** cobre tipos TypeScript de WorkflowTemplateStep e WorkflowStep
- [x] **Task 3** cobre KanbanColumn, KanbanFlow, query e mapeamento em kanban-actions
- [x] **Task 4** cobre WorkItemView e query em pasta-actions
- [x] **Task 5** cobre upsertTemplateStepAction com novos campos
- [x] **Task 6** cobre thread de allSteps + allTemplates via KanbanBoard
- [x] **Task 7** cobre UI do editor com Bloco A (destinos) + Bloco B (fork)
- [x] **Task 8** cobre card com botões inline, FORK_PENDING bloqueado e animação LIBERADO
- [x] BranchDialog removido — substituído por botões inline
- [x] RPC trata fork creation, fork resolution e fallback ao completar fluxo fork
- [x] `getUserKanbanAction` atualizado com `template_steps: []` para não quebrar o tipo
