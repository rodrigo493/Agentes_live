# Workflow Kanban Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a pasta view atual por um board Kanban completo onde admin vê todos os fluxos com todas as etapas e usuários, e cada usuário vê apenas as etapas onde é responsável.

**Architecture:** Novos server actions `getUserKanbanAction` e `getAdminKanbanAction` em `kanban-actions.ts` retornam itens agrupados por template→coluna. Quatro novos componentes `KanbanCard → KanbanColumn → KanbanBoard → (UserKanbanView | AdminKanbanView)` formam a hierarquia de UI. `WorkflowPastaView` é removido e substituído por `UserKanbanView`. `WorkflowShell` recebe nova aba "Kanban" com `AdminKanbanView`.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), React Client Components, Tailwind CSS, shadcn/ui, sonner (toasts)

---

## File Map

| Status | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| CREATE | `squados/supabase/migrations/00045_workflow_trigger_config.sql` | Coluna `trigger_config` em `workflow_templates` |
| CREATE | `squados/src/features/workflows/actions/kanban-actions.ts` | `getUserKanbanAction` + `getAdminKanbanAction` |
| CREATE | `squados/src/features/workflows/components/workflow-kanban-card.tsx` | Card individual com SLA timer + botão avançar |
| CREATE | `squados/src/features/workflows/components/workflow-kanban-column.tsx` | Coluna única do board |
| CREATE | `squados/src/features/workflows/components/workflow-kanban-board.tsx` | Board horizontal com todas as colunas |
| CREATE | `squados/src/features/workflows/components/workflow-user-kanban.tsx` | Visão usuário — substitui pasta-view |
| CREATE | `squados/src/features/workflows/components/workflow-admin-kanban.tsx` | Visão admin — stats + tabs + boards |
| MODIFY | `squados/src/features/workflows/components/workflow-shell.tsx` | Adiciona aba "Kanban" com AdminKanbanView |
| MODIFY | `squados/src/app/(app)/operations/page.tsx` | Substitui WorkflowPastaView por UserKanbanView |
| DELETE | `squados/src/features/workflows/components/workflow-pasta-view.tsx` | Removido após migração |

---

## Task 1: DB Migration — trigger_config

**Files:**
- Create: `squados/supabase/migrations/00045_workflow_trigger_config.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- squados/supabase/migrations/00045_workflow_trigger_config.sql
ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS trigger_config jsonb
  NOT NULL DEFAULT '{"type":"manual"}'::jsonb;

COMMENT ON COLUMN workflow_templates.trigger_config IS
  'Configuração de origem dos itens. Ex: {"type":"manual"}, {"type":"webhook","token":"abc"}, {"type":"flow_chain","source_template_id":"uuid","source_step_order":5}';
```

- [ ] **Step 2: Aplicar migration no Supabase remoto**

```bash
cd squados
npx supabase db push --linked
```

Expected: `Applying migration 00045_workflow_trigger_config.sql... done`

- [ ] **Step 3: Commit**

```bash
git add squados/supabase/migrations/00045_workflow_trigger_config.sql
git commit -m "feat: add trigger_config column to workflow_templates"
```

---

## Task 2: Server Actions — kanban-actions.ts

**Files:**
- Create: `squados/src/features/workflows/actions/kanban-actions.ts`

Os tipos `WorkItemView` e `StepNote` já existem em `pasta-actions.ts` — importar, não redefinir.

- [ ] **Step 1: Criar kanban-actions.ts**

```typescript
// squados/src/features/workflows/actions/kanban-actions.ts
'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { WorkItemView, StepNote } from './pasta-actions';

export interface KanbanColumn {
  step_order: number;
  step_title: string;
  sla_hours: number;
  assignee_name: string | null;
  items: WorkItemView[];
}

export interface KanbanFlow {
  template_id: string;
  template_name: string;
  template_color: string;
  columns: KanbanColumn[];
  overdue_count: number;
}

export interface KanbanStats {
  total: number;
  overdue: number;
  warning: number;
  ok: number;
}

// Usuário: só etapas onde ele é responsável, agrupadas por template → step_order
export async function getUserKanbanAction(): Promise<{
  flows?: KanbanFlow[];
  isAdmin: boolean;
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const { data: steps, error } = await admin
    .from('workflow_steps')
    .select(`
      id, instance_id, status, due_at, started_at, assignee_id, notes,
      template_step_id,
      instance:workflow_instances!inner(
        id, reference, title, template_id, status,
        template:workflow_templates!inner(id, name, color)
      ),
      template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(
        id, step_order, title, sla_hours
      )
    `)
    .eq('assignee_id', user.id)
    .in('status', ['in_progress', 'pending', 'blocked', 'overdue']);

  if (error) return { isAdmin, error: error.message };

  const templateIds = [...new Set(
    (steps ?? []).map((s) => {
      const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
      return inst?.template_id;
    }).filter(Boolean),
  )] as string[];

  if (templateIds.length === 0) return { isAdmin, flows: [] };

  const { data: allTplSteps } = await admin
    .from('workflow_template_steps')
    .select('id, template_id, step_order, title, sla_hours, assignee_user_id')
    .in('template_id', templateIds)
    .order('step_order');

  const tplStepsByTemplate = new Map<string, typeof allTplSteps>();
  for (const ts of allTplSteps ?? []) {
    if (!ts.template_id) continue;
    const arr = tplStepsByTemplate.get(ts.template_id) ?? [];
    arr.push(ts);
    tplStepsByTemplate.set(ts.template_id, arr);
  }

  const items: WorkItemView[] = [];
  for (const s of steps ?? []) {
    const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
    if (!inst || inst.status !== 'running') continue;
    const tmpl = Array.isArray(inst.template) ? inst.template[0] : inst.template;
    if (!tmpl) continue;
    const tplStep = Array.isArray(s.template_step) ? s.template_step[0] : s.template_step;
    if (!tplStep) continue;

    const tplSteps = tplStepsByTemplate.get(inst.template_id) ?? [];
    const nextTs = tplSteps.find((ts) => ts.step_order === tplStep.step_order + 1) ?? null;

    items.push({
      step_id: s.id,
      instance_id: s.instance_id,
      reference: inst.reference,
      title: inst.title ?? null,
      template_id: inst.template_id,
      template_name: tmpl.name,
      template_color: tmpl.color ?? '#6366f1',
      step_title: tplStep.title,
      step_order: tplStep.step_order,
      sla_hours: Number(tplStep.sla_hours),
      assignee_id: s.assignee_id,
      started_at: s.started_at ?? null,
      due_at: s.due_at ?? null,
      status: s.status,
      notes: (s.notes as StepNote[]) ?? [],
      next_step_title: nextTs?.title ?? null,
      next_assignee_id: nextTs?.assignee_user_id ?? null,
    });
  }

  const flowMap = new Map<string, KanbanFlow>();
  const now = Date.now();

  for (const item of items) {
    if (!flowMap.has(item.template_id)) {
      flowMap.set(item.template_id, {
        template_id: item.template_id,
        template_name: item.template_name,
        template_color: item.template_color,
        columns: [],
        overdue_count: 0,
      });
    }
    const flow = flowMap.get(item.template_id)!;
    let col = flow.columns.find((c) => c.step_order === item.step_order);
    if (!col) {
      col = {
        step_order: item.step_order,
        step_title: item.step_title,
        sla_hours: item.sla_hours,
        assignee_name: null,
        items: [],
      };
      flow.columns.push(col);
      flow.columns.sort((a, b) => a.step_order - b.step_order);
    }
    col.items.push(item);
    if (item.due_at && new Date(item.due_at).getTime() < now) {
      flow.overdue_count++;
    }
  }

  return { isAdmin, flows: Array.from(flowMap.values()) };
}

// Admin: todos os templates com TODAS as colunas (inclusive vazias) + todos os itens
export async function getAdminKanbanAction(): Promise<{
  flows?: KanbanFlow[];
  stats?: KanbanStats;
  error?: string;
}> {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Acesso restrito a admins' };
  }
  const admin = createAdminClient();

  const [{ data: templates }, { data: steps, error: stepsErr }] = await Promise.all([
    admin
      .from('workflow_templates')
      .select('id, name, color, workflow_template_steps(id, step_order, title, sla_hours, assignee_user_id)')
      .eq('is_active', true)
      .order('name'),
    admin
      .from('workflow_steps')
      .select(`
        id, instance_id, status, due_at, started_at, assignee_id, notes,
        template_step_id,
        instance:workflow_instances!inner(
          id, reference, title, template_id, status,
          template:workflow_templates!inner(id, name, color)
        ),
        template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(
          id, step_order, title, sla_hours
        )
      `)
      .in('status', ['in_progress', 'pending', 'blocked', 'overdue']),
  ]);

  if (stepsErr) return { error: stepsErr.message };

  // Buscar nomes dos responsáveis padrão de cada template_step
  const assigneeIds = [...new Set(
    (templates ?? []).flatMap((t) =>
      ((t.workflow_template_steps as Array<{ assignee_user_id: string | null }>) ?? [])
        .map((s) => s.assignee_user_id)
        .filter(Boolean),
    ),
  )] as string[];

  const assigneeMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', assigneeIds);
    for (const p of profiles ?? []) assigneeMap.set(p.id, p.full_name ?? '');
  }

  type TplStepRow = { id: string; step_order: number; title: string; sla_hours: number; assignee_user_id: string | null };
  const tplStepsByTemplate = new Map<string, TplStepRow[]>();
  for (const t of templates ?? []) {
    const ts = ((t.workflow_template_steps as TplStepRow[]) ?? [])
      .sort((a, b) => a.step_order - b.step_order);
    tplStepsByTemplate.set(t.id, ts);
  }

  // Montar WorkItemViews
  const allItems: WorkItemView[] = [];
  for (const s of steps ?? []) {
    const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
    if (!inst || inst.status !== 'running') continue;
    const tmpl = Array.isArray(inst.template) ? inst.template[0] : inst.template;
    if (!tmpl) continue;
    const tplStep = Array.isArray(s.template_step) ? s.template_step[0] : s.template_step;
    if (!tplStep) continue;

    const tplSteps = tplStepsByTemplate.get(inst.template_id) ?? [];
    const nextTs = tplSteps.find((ts) => ts.step_order === tplStep.step_order + 1) ?? null;

    allItems.push({
      step_id: s.id,
      instance_id: s.instance_id,
      reference: inst.reference,
      title: inst.title ?? null,
      template_id: inst.template_id,
      template_name: tmpl.name,
      template_color: tmpl.color ?? '#6366f1',
      step_title: tplStep.title,
      step_order: tplStep.step_order,
      sla_hours: Number(tplStep.sla_hours),
      assignee_id: s.assignee_id,
      started_at: s.started_at ?? null,
      due_at: s.due_at ?? null,
      status: s.status,
      notes: (s.notes as StepNote[]) ?? [],
      next_step_title: nextTs?.title ?? null,
      next_assignee_id: nextTs?.assignee_user_id ?? null,
    });
  }

  const stats: KanbanStats = { total: 0, overdue: 0, warning: 0, ok: 0 };
  const now = Date.now();

  const flows: KanbanFlow[] = (templates ?? []).map((t) => {
    const tplSteps = tplStepsByTemplate.get(t.id) ?? [];
    const templateItems = allItems.filter((i) => i.template_id === t.id);

    const columns: KanbanColumn[] = tplSteps.map((ts) => ({
      step_order: ts.step_order,
      step_title: ts.title,
      sla_hours: Number(ts.sla_hours),
      assignee_name: ts.assignee_user_id ? (assigneeMap.get(ts.assignee_user_id) ?? null) : null,
      items: templateItems.filter((i) => i.step_order === ts.step_order),
    }));

    const overdueCount = templateItems.filter(
      (i) => i.due_at && new Date(i.due_at).getTime() < now,
    ).length;

    for (const item of templateItems) {
      stats.total++;
      if (!item.due_at) { stats.ok++; continue; }
      const diff = new Date(item.due_at).getTime() - now;
      if (diff < 0) stats.overdue++;
      else if (diff < item.sla_hours * 3_600_000 * 0.3) stats.warning++;
      else stats.ok++;
    }

    return {
      template_id: t.id,
      template_name: t.name,
      template_color: (t as { id: string; name: string; color?: string | null }).color ?? '#6366f1',
      columns,
      overdue_count: overdueCount,
    };
  });

  return { flows, stats };
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd squados
npx tsc --noEmit 2>&1 | head -30
```

Expected: sem erros relacionados a `kanban-actions.ts`

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/actions/kanban-actions.ts
git commit -m "feat: add getUserKanbanAction and getAdminKanbanAction"
```

---

## Task 3: KanbanCard Component

**Files:**
- Create: `squados/src/features/workflows/components/workflow-kanban-card.tsx`

Substitui `WorkItemCard` com layout mais compacto e adaptado ao board horizontal. Reutiliza a lógica de `computeTimerState` de `work-item-card.tsx`.

- [ ] **Step 1: Criar workflow-kanban-card.tsx**

```tsx
// squados/src/features/workflows/components/workflow-kanban-card.tsx
'use client';

import { useState } from 'react';
import { Clock, AlertTriangle, ChevronRight, FileText, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView;
  showAssignee?: boolean;
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

function computeSlaState(item: WorkItemView) {
  if (!item.due_at) return { label: 'Sem prazo', color: 'text-muted-foreground', state: 'none' as const };
  const now = Date.now();
  const dueMs = new Date(item.due_at).getTime();
  const diffMs = dueMs - now;
  const slaMs = item.sla_hours * 3_600_000;

  if (diffMs < 0) {
    const h = Math.floor(Math.abs(diffMs) / 3_600_000);
    const m = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
    return { label: `+${h}h ${m}min além`, color: 'text-red-500', state: 'overdue' as const };
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffMs / slaMs <= 0.3) {
    return { label: `${h}h ${m}min`, color: 'text-yellow-500', state: 'warning' as const };
  }
  return { label: `${h}h ${m}min`, color: 'text-emerald-500', state: 'ok' as const };
}

export function KanbanCard({ item, showAssignee, onAdvance, onOpenNotes }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const sla = computeSlaState(item);

  const borderClass =
    sla.state === 'overdue'
      ? 'border-l-4 border-l-red-500 bg-red-500/5'
      : sla.state === 'warning'
        ? 'border-l-4 border-l-yellow-500'
        : 'border-l-4 border-l-emerald-500/50';

  async function handleAdvance() {
    setAdvancing(true);
    try { await onAdvance(item.step_id); } finally { setAdvancing(false); }
  }

  const lastNote = item.notes.at(-1);

  return (
    <div className={`rounded-lg border border-border p-3 space-y-2 bg-card ${borderClass} relative`}>
      {sla.state === 'overdue' && (
        <Badge variant="destructive" className="absolute -top-2 -right-2 text-[9px] px-1 py-0.5 flex items-center gap-0.5">
          <AlertTriangle className="w-2.5 h-2.5" /> ATRASADO
        </Badge>
      )}

      <div>
        <p className="text-sm font-bold leading-tight">{item.reference}</p>
        {item.title && (
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{item.title}</p>
        )}
      </div>

      {showAssignee && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <User className="w-3 h-3" />
          <span>{item.assignee_id.slice(0, 8)}…</span>
        </div>
      )}

      <div className={`flex items-center gap-1 text-[11px] font-semibold ${sla.color}`}>
        <Clock className="w-3 h-3 flex-shrink-0" />
        {sla.label}
      </div>

      {lastNote && (
        <p className="text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1 border-l-2 border-border line-clamp-2">
          {lastNote.text}
        </p>
      )}

      <div className="flex gap-1 pt-0.5">
        {item.next_step_title ? (
          <Button
            size="sm"
            className="flex-1 h-7 text-[10px] font-bold gap-0.5"
            disabled={advancing}
            onClick={handleAdvance}
          >
            {advancing ? 'Avançando…' : (
              <>✓ Avançar <ChevronRight className="w-3 h-3" /> {item.next_step_title}</>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-[10px] font-bold text-emerald-600 border-emerald-600/40"
            disabled={advancing}
            onClick={handleAdvance}
          >
            {advancing ? 'Concluindo…' : '✓ Concluir'}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground"
          onClick={() => onOpenNotes(item)}
          title="Ver / adicionar notas"
        >
          <FileText className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep kanban-card
```

Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-kanban-card.tsx
git commit -m "feat: add KanbanCard component"
```

---

## Task 4: KanbanColumn Component

**Files:**
- Create: `squados/src/features/workflows/components/workflow-kanban-column.tsx`

- [ ] **Step 1: Criar workflow-kanban-column.tsx**

```tsx
// squados/src/features/workflows/components/workflow-kanban-column.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { KanbanCard } from './workflow-kanban-card';
import type { KanbanColumn as KanbanColumnData } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';

const STEP_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#0891b2',
  '#10b981', '#ef4444', '#ec4899', '#84cc16',
];

interface Props {
  column: KanbanColumnData;
  showAssignee?: boolean;
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

export function KanbanColumn({ column, showAssignee, onAdvance, onOpenNotes }: Props) {
  const color = STEP_COLORS[(column.step_order - 1) % STEP_COLORS.length];
  const overdueCount = column.items.filter(
    (i) => i.due_at && new Date(i.due_at).getTime() < Date.now(),
  ).length;

  return (
    <div className="flex flex-col w-[200px] flex-shrink-0 bg-muted/30 rounded-xl border border-border overflow-hidden">
      {/* Cabeçalho da coluna */}
      <div className="px-3 py-2.5 border-b border-border space-y-0.5"
           style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground flex-1 truncate">
            {column.step_order}. {column.step_title}
          </span>
          {overdueCount > 0 ? (
            <Badge variant="destructive" className="text-[9px] h-4 px-1">{overdueCount}</Badge>
          ) : (
            <Badge variant="secondary" className="text-[9px] h-4 px-1">{column.items.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {column.assignee_name && <span>👤 {column.assignee_name}</span>}
          <span className="ml-auto">⏱ {column.sla_hours}h SLA</span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 max-h-[60vh]">
        {column.items.length === 0 ? (
          <div className="text-[10px] text-muted-foreground/50 text-center py-6">
            Nenhum item
          </div>
        ) : (
          column.items.map((item) => (
            <KanbanCard
              key={item.step_id}
              item={item}
              showAssignee={showAssignee}
              onAdvance={onAdvance}
              onOpenNotes={onOpenNotes}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep kanban-column
```

Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-kanban-column.tsx
git commit -m "feat: add KanbanColumn component"
```

---

## Task 5: KanbanBoard Component

**Files:**
- Create: `squados/src/features/workflows/components/workflow-kanban-board.tsx`

- [ ] **Step 1: Criar workflow-kanban-board.tsx**

```tsx
// squados/src/features/workflows/components/workflow-kanban-board.tsx
'use client';

import { KanbanColumn } from './workflow-kanban-column';
import type { KanbanFlow } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  flow: KanbanFlow;
  showAssignee?: boolean;
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

export function KanbanBoard({ flow, showAssignee, onAdvance, onOpenNotes }: Props) {
  if (flow.columns.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center border rounded-xl">
        Este fluxo não possui etapas configuradas.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 pt-1">
      {flow.columns.map((col, idx) => (
        <div key={col.step_order} className="flex items-start gap-3">
          <KanbanColumn
            column={col}
            showAssignee={showAssignee}
            onAdvance={onAdvance}
            onOpenNotes={onOpenNotes}
          />
          {idx < flow.columns.length - 1 && (
            <div className="text-muted-foreground/30 text-lg mt-8 flex-shrink-0">›</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep kanban-board
```

Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-kanban-board.tsx
git commit -m "feat: add KanbanBoard component"
```

---

## Task 6: UserKanbanView — Visão do Usuário

Substitui `WorkflowPastaView`. Mostra os fluxos e etapas onde o usuário é responsável.

**Files:**
- Create: `squados/src/features/workflows/components/workflow-user-kanban.tsx`

- [ ] **Step 1: Criar workflow-user-kanban.tsx**

```tsx
// squados/src/features/workflows/components/workflow-user-kanban.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getUserKanbanAction } from '../actions/kanban-actions';
import { advanceWithNoteAction } from '../actions/pasta-actions';
import type { KanbanFlow } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import { KanbanBoard } from './workflow-kanban-board';
import { ItemNotesSheet } from './item-notes-sheet';
import { NewItemModal } from './new-item-modal';

interface Template { id: string; name: string; }

interface Props { templates: Template[]; }

export function UserKanbanView({ templates }: Props) {
  const [flows, setFlows] = useState<KanbanFlow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notesItem, setNotesItem] = useState<WorkItemView | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getUserKanbanAction();
      if (r.flows) setFlows(r.flows);
      if (r.isAdmin !== undefined) setIsAdmin(r.isAdmin);
    } catch (err) {
      console.error('Falha ao carregar kanban:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleAdvance(stepId: string) {
    await advanceWithNoteAction(stepId);
    await load();
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Carregando fluxos…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Meus Trabalhos</h2>
        {isAdmin && (
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setNewItemOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Novo Item
          </Button>
        )}
      </div>

      {flows.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-sm text-muted-foreground">
          {isAdmin
            ? 'Nenhum item ativo. Crie um novo item acima.'
            : 'Você não tem itens ativos no momento.'}
        </div>
      ) : (
        flows.map((flow) => (
          <div key={flow.template_id} className="border rounded-xl p-4 space-y-3 bg-card">
            <div className="flex items-center gap-2 flex-wrap">
              <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold text-sm">{flow.template_name}</span>
              {flow.overdue_count > 0 ? (
                <Badge variant="destructive" className="text-[10px]">
                  {flow.overdue_count} em atraso
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {flow.columns.reduce((acc, c) => acc + c.items.length, 0)} em andamento
                </Badge>
              )}
            </div>
            <KanbanBoard
              flow={flow}
              showAssignee={false}
              onAdvance={handleAdvance}
              onOpenNotes={setNotesItem}
            />
          </div>
        ))
      )}

      <ItemNotesSheet
        item={notesItem}
        onClose={() => setNotesItem(null)}
        onNoteAdded={load}
      />

      <NewItemModal
        open={newItemOpen}
        templates={templates}
        onClose={() => setNewItemOpen(false)}
        onCreated={load}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep user-kanban
```

Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-user-kanban.tsx
git commit -m "feat: add UserKanbanView replacing pasta-view"
```

---

## Task 7: AdminKanbanView — Visão do Admin

Mostra stats globais + tabs por fluxo + KanbanBoard para o fluxo selecionado.

**Files:**
- Create: `squados/src/features/workflows/components/workflow-admin-kanban.tsx`

- [ ] **Step 1: Criar workflow-admin-kanban.tsx**

```tsx
// squados/src/features/workflows/components/workflow-admin-kanban.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAdminKanbanAction } from '../actions/kanban-actions';
import { advanceWithNoteAction } from '../actions/pasta-actions';
import type { KanbanFlow, KanbanStats } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import { KanbanBoard } from './workflow-kanban-board';
import { ItemNotesSheet } from './item-notes-sheet';

export function AdminKanbanView() {
  const [flows, setFlows] = useState<KanbanFlow[]>([]);
  const [stats, setStats] = useState<KanbanStats>({ total: 0, overdue: 0, warning: 0, ok: 0 });
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesItem, setNotesItem] = useState<WorkItemView | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getAdminKanbanAction();
      if (r.flows) {
        setFlows(r.flows);
        // Usa functional updater para não precisar de activeTab na dependency array
        setActiveTab((prev) => prev ?? (r.flows!.length > 0 ? r.flows![0].template_id : null));
      }
      if (r.stats) setStats(r.stats);
    } catch (err) {
      console.error('Falha ao carregar kanban admin:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleAdvance(stepId: string) {
    await advanceWithNoteAction(stepId);
    await load();
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Carregando…</div>;
  }

  const activeFlow = flows.find((f) => f.template_id === activeTab) ?? null;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Ativos', value: stats.total, color: 'text-blue-500' },
          { label: 'Atrasados', value: stats.overdue, color: 'text-red-500' },
          { label: 'Atenção', value: stats.warning, color: 'text-yellow-500' },
          { label: 'No prazo', value: stats.ok, color: 'text-emerald-500' },
        ].map((s) => (
          <div key={s.label} className="border rounded-xl p-3 bg-card text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs por fluxo */}
      {flows.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {flows.map((flow) => (
            <button
              key={flow.template_id}
              onClick={() => setActiveTab(flow.template_id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                activeTab === flow.template_id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: flow.template_color }}
              />
              {flow.template_name}
              {flow.overdue_count > 0 && (
                <span className="bg-red-500 text-white rounded-full px-1 text-[9px] font-bold">
                  {flow.overdue_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Board do fluxo selecionado */}
      {activeFlow ? (
        <KanbanBoard
          flow={activeFlow}
          showAssignee={true}
          onAdvance={handleAdvance}
          onOpenNotes={setNotesItem}
        />
      ) : (
        <div className="border rounded-xl p-8 text-center text-sm text-muted-foreground">
          Nenhum fluxo ativo. Crie um fluxo e inicie um item para visualizar o board.
        </div>
      )}

      <ItemNotesSheet
        item={notesItem}
        onClose={() => setNotesItem(null)}
        onNoteAdded={load}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep admin-kanban
```

Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-admin-kanban.tsx
git commit -m "feat: add AdminKanbanView with stats and tabs"
```

---

## Task 8: Wire — Conectar tudo e remover pasta-view

**Files:**
- Modify: `squados/src/features/workflows/components/workflow-shell.tsx`
- Modify: `squados/src/app/(app)/operations/page.tsx`
- Delete: `squados/src/features/workflows/components/workflow-pasta-view.tsx`

- [ ] **Step 1: Adicionar aba Kanban ao workflow-shell.tsx**

Em `workflow-shell.tsx`, localizar a linha `type View = 'templates' | 'instances' | 'overdue' | 'analytics';` e substituir:

```typescript
type View = 'templates' | 'kanban' | 'instances' | 'overdue' | 'analytics';
```

Localizar o bloco de botões de navegação e adicionar o botão Kanban após "Fluxos":

```tsx
// Adicionar após o botão "Fluxos":
{isAdmin && (
  <Button size="sm" variant={view === 'kanban' ? 'default' : 'outline'} onClick={() => setView('kanban')}>
    Kanban
  </Button>
)}
```

Adicionar import no topo do arquivo:

```typescript
import { AdminKanbanView } from './workflow-admin-kanban';
```

Adicionar rendering da view kanban, após o bloco `{view === 'templates' && ...}`:

```tsx
{view === 'kanban' && isAdmin && <AdminKanbanView />}
```

O arquivo completo modificado fica assim (apenas as partes que mudam):

```typescript
// Linha 1: adicionar import
import { AdminKanbanView } from './workflow-admin-kanban';

// type View: adicionar 'kanban'
type View = 'templates' | 'kanban' | 'instances' | 'overdue' | 'analytics';

// No bloco de botões, adicionar após o botão "Fluxos":
{isAdmin && (
  <Button size="sm" variant={view === 'kanban' ? 'default' : 'outline'} onClick={() => setView('kanban')}>
    Kanban
  </Button>
)}

// Após o bloco {view === 'templates' && ...}:
{view === 'kanban' && isAdmin && <AdminKanbanView />}
```

- [ ] **Step 2: Aplicar as edições em workflow-shell.tsx**

Editar `squados/src/features/workflows/components/workflow-shell.tsx`:

1. Adicionar `import { AdminKanbanView } from './workflow-admin-kanban';` na linha 10 (após as outras importações)

2. Alterar linha `type View = 'templates' | 'instances' | 'overdue' | 'analytics';` para:
   `type View = 'templates' | 'kanban' | 'instances' | 'overdue' | 'analytics';`

3. Após `<Button size="sm" variant={view === 'templates' ? 'default' : 'outline'} onClick={() => setView('templates')}>Fluxos</Button>` adicionar:
```tsx
{isAdmin && (
  <Button size="sm" variant={view === 'kanban' ? 'default' : 'outline'} onClick={() => setView('kanban')}>
    Kanban
  </Button>
)}
```

4. Após o bloco `{view === 'templates' && ( ... )}` adicionar:
```tsx
{view === 'kanban' && isAdmin && <AdminKanbanView />}
```

- [ ] **Step 3: Substituir WorkflowPastaView por UserKanbanView em operations/page.tsx**

Em `squados/src/app/(app)/operations/page.tsx`:

Alterar o import:
```typescript
// REMOVER:
import { WorkflowPastaView } from '@/features/workflows/components/workflow-pasta-view';

// ADICIONAR:
import { UserKanbanView } from '@/features/workflows/components/workflow-user-kanban';
```

Alterar o JSX na linha que usa `WorkflowPastaView`:
```tsx
// REMOVER:
<WorkflowPastaView templates={templates.map((t) => ({ id: t.id, name: t.name }))} />

// ADICIONAR:
<UserKanbanView templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
```

- [ ] **Step 4: Deletar workflow-pasta-view.tsx**

```bash
rm squados/src/features/workflows/components/workflow-pasta-view.tsx
```

- [ ] **Step 5: Verificar que o build passa**

```bash
cd squados && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` ou `Route (app)` listing sem erros

Se houver erros de TypeScript, corrigi-los antes de continuar.

- [ ] **Step 6: Commit final**

```bash
git add squados/src/features/workflows/components/workflow-shell.tsx
git add squados/src/app/(app)/operations/page.tsx
git add -u squados/src/features/workflows/components/workflow-pasta-view.tsx
git commit -m "feat: wire Kanban views to operations page, remove pasta-view"
```

---

## Verificação Final

- [ ] Abrir `http://localhost:3000/operations` logado como **usuário comum** — deve ver "Meus Trabalhos" com os fluxos e etapas onde é responsável
- [ ] Abrir `http://localhost:3000/operations` logado como **admin** — deve ver seção `WorkflowShell` com aba "Kanban" adicionada
- [ ] Clicar em "Kanban" no WorkflowShell — deve mostrar stats (Ativos/Atrasados/Atenção/No prazo) + tabs por fluxo + board
- [ ] Selecionar tab de um fluxo — deve mostrar colunas com as etapas e cards dentro de cada coluna
- [ ] Clicar "✓ Avançar" num card — item deve avançar para a próxima coluna e o board recarregar
- [ ] Clicar no ícone 📎 num card — deve abrir o `ItemNotesSheet` lateral
