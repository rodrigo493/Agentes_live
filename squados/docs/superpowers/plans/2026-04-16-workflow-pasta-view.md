# WorkflowPastaView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a página de Operações para que cada fluxo de trabalho apareça como uma "pasta" com os itens ativos do usuário, timer de prazo, diário de bordo e botão para avançar ao próximo responsável.

**Architecture:** Novo componente `WorkflowPastaView` substitui `WorkflowFlowsView` na página de operações. Uma server action dedicada (`pasta-actions.ts`) busca os itens agrupados por template filtrando pelo `assignee_id` do usuário logado. Ao avançar, a action completa a etapa via RPC existente, salva nota opcional no campo `notes` JSONB da `workflow_steps`, e envia DM automático no workspace para o próximo responsável.

**Tech Stack:** Next.js 15 App Router, Supabase (RPC existente `complete_workflow_step`), React client components com polling 30s, Tailwind CSS, shadcn/ui (Sheet, Dialog, Button, Badge)

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/00038_workflow_step_notes.sql` | Criar | Adiciona coluna `notes jsonb` à `workflow_steps` |
| `src/features/workflows/actions/pasta-actions.ts` | Criar | Server actions: busca itens, avança etapa, cria item, adiciona nota |
| `src/features/workflows/components/workflow-pasta-view.tsx` | Criar | Container principal — busca dados, renderiza pastas |
| `src/features/workflows/components/work-item-card.tsx` | Criar | Card individual com timer, notas e botão avançar |
| `src/features/workflows/components/item-notes-sheet.tsx` | Criar | Sheet lateral com diário de bordo + campo nova nota |
| `src/features/workflows/components/new-item-modal.tsx` | Criar | Modal admin para criar novo item de trabalho |
| `src/app/(app)/operations/page.tsx` | Modificar | Troca componentes, torna setores compactos |
| `src/app/api/workflow-items/route.ts` | Criar | Endpoint POST para integração externa (LivePosVenda) |

---

## Task 1: Migration — Adicionar `notes` à `workflow_steps`

**Files:**
- Create: `supabase/migrations/00038_workflow_step_notes.sql`

- [ ] **Step 1: Criar migration**

```sql
-- 00038_workflow_step_notes.sql
-- Adiciona diário de bordo por etapa de instância.
-- Cada entrada: { author_id, author_name, step_title, text, created_at }

ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS notes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN workflow_steps.notes IS
  'Array de anotações acumuladas nesta etapa. Formato: [{author_id, author_name, step_title, text, created_at}]';
```

- [ ] **Step 2: Aplicar migration**

```bash
cd squados
npx supabase db push
```

Expected: `Applied 1 migration` sem erros.

- [ ] **Step 3: Verificar coluna**

```bash
npx supabase db diff
```

Expected: sem diff pendente (migration aplicada).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00038_workflow_step_notes.sql
git commit -m "feat(db): adiciona notes jsonb em workflow_steps para diário de bordo"
```

---

## Task 2: Server Actions — `pasta-actions.ts`

**Files:**
- Create: `src/features/workflows/actions/pasta-actions.ts`

- [ ] **Step 1: Criar o arquivo com os tipos e a action principal**

```typescript
'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createClient } from '@/shared/lib/supabase/server';
import { completeStepAction } from './instance-actions';
import { getOrCreateDMConversation } from '@/features/workspace/actions/workspace-actions';

export interface StepNote {
  author_id: string;
  author_name: string;
  step_title: string;
  text: string;
  created_at: string;
}

export interface WorkItemView {
  step_id: string;
  instance_id: string;
  reference: string;
  title: string | null;
  template_id: string;
  template_name: string;
  template_color: string;
  step_title: string;
  step_order: number;
  sla_hours: number;
  assignee_id: string;
  started_at: string | null;
  due_at: string | null;
  status: string;
  notes: StepNote[];
  next_step_title: string | null;
  next_assignee_id: string | null;
}

export interface PastaView {
  template_id: string;
  template_name: string;
  template_color: string;
  items: WorkItemView[];
}
```

- [ ] **Step 2: Implementar `getPastaViewAction`**

Adicionar após os tipos no mesmo arquivo:

```typescript
export async function getPastaViewAction(): Promise<{
  pastas?: PastaView[];
  isAdmin: boolean;
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  // Buscar steps ativos com joins
  let stepsQuery = admin
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
    .in('status', ['in_progress', 'pending', 'blocked', 'overdue']);

  if (!isAdmin) {
    stepsQuery = stepsQuery.eq('assignee_id', user.id);
  }

  const { data: steps, error } = await stepsQuery;
  if (error) return { isAdmin, error: error.message };

  // Coletar todos os template_ids únicos para buscar próximas etapas
  const templateIds = [...new Set(
    (steps ?? []).map((s) => {
      const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
      return inst?.template_id;
    }).filter(Boolean)
  )] as string[];

  // Buscar todas as template_steps de cada template (para calcular próxima etapa)
  const { data: allTplSteps } = await admin
    .from('workflow_template_steps')
    .select('id, template_id, step_order, title, assignee_user_id, assignee_sector_id')
    .in('template_id', templateIds)
    .order('step_order');

  const tplStepsByTemplate = new Map<string, typeof allTplSteps>();
  for (const ts of allTplSteps ?? []) {
    if (!ts.template_id) continue;
    const arr = tplStepsByTemplate.get(ts.template_id) ?? [];
    arr.push(ts);
    tplStepsByTemplate.set(ts.template_id, arr);
  }

  // Montar WorkItemView para cada step
  const items: WorkItemView[] = [];
  for (const s of steps ?? []) {
    const inst = Array.isArray(s.instance) ? s.instance[0] : s.instance;
    if (!inst || inst.status !== 'running') continue;
    const tmpl = Array.isArray(inst.template) ? inst.template[0] : inst.template;
    if (!tmpl) continue;
    const tplStep = Array.isArray(s.template_step) ? s.template_step[0] : s.template_step;
    if (!tplStep) continue;

    // Próxima etapa
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

  // Agrupar por template
  const pastaMap = new Map<string, PastaView>();
  for (const item of items) {
    if (!pastaMap.has(item.template_id)) {
      pastaMap.set(item.template_id, {
        template_id: item.template_id,
        template_name: item.template_name,
        template_color: item.template_color,
        items: [],
      });
    }
    pastaMap.get(item.template_id)!.items.push(item);
  }

  return { isAdmin, pastas: Array.from(pastaMap.values()) };
}
```

- [ ] **Step 3: Implementar `advanceWithNoteAction`**

Adicionar após `getPastaViewAction` no mesmo arquivo:

```typescript
export async function advanceWithNoteAction(
  stepId: string,
  note?: string
): Promise<{ error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Buscar step atual com dados do template_step e instance
  const { data: step } = await admin
    .from('workflow_steps')
    .select(`
      id, notes, template_step_id,
      template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title),
      instance:workflow_instances!inner(reference, template_id)
    `)
    .eq('id', stepId)
    .single();

  if (!step) return { error: 'Etapa não encontrada' };

  const tplStep = Array.isArray(step.template_step) ? step.template_step[0] : step.template_step;
  const inst = Array.isArray(step.instance) ? step.instance[0] : step.instance;

  // Salvar nota na etapa atual se fornecida
  if (note?.trim()) {
    const currentNotes = (step.notes as StepNote[]) ?? [];
    const newNote: StepNote = {
      author_id: user.id,
      author_name: profile.full_name ?? 'Usuário',
      step_title: tplStep?.title ?? 'Etapa',
      text: note.trim(),
      created_at: new Date().toISOString(),
    };
    await admin
      .from('workflow_steps')
      .update({ notes: [...currentNotes, newNote] })
      .eq('id', stepId);
  }

  // Completar etapa (RPC existente cria próxima etapa automaticamente)
  const { next_step_id, error } = await completeStepAction(stepId);
  if (error) return { error };

  // Notificar próximo responsável via workspace DM
  if (next_step_id) {
    const { data: nextStep } = await admin
      .from('workflow_steps')
      .select('assignee_id, template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title)')
      .eq('id', next_step_id)
      .single();

    const nextAssigneeId = nextStep?.assignee_id;
    const nextTplStep = nextStep
      ? (Array.isArray(nextStep.template_step) ? nextStep.template_step[0] : nextStep.template_step)
      : null;

    if (nextAssigneeId && nextAssigneeId !== user.id) {
      const dmResult = await getOrCreateDMConversation(nextAssigneeId);
      if (dmResult.data?.id) {
        const supabase = await createClient();
        await supabase.from('messages').insert({
          conversation_id: dmResult.data.id,
          sender_id: user.id,
          sender_type: 'user',
          content: `📂 Novo item no seu fluxo: **${inst?.reference ?? 'Item'}** — ${nextTplStep?.title ?? 'próxima etapa'}. Acesse Operações para ver.`,
          content_type: 'text',
        });
      }
    }
  }

  return {};
}
```

- [ ] **Step 4: Implementar `addNoteToStepAction`**

Adicionar após `advanceWithNoteAction`:

```typescript
export async function addNoteToStepAction(
  stepId: string,
  noteText: string
): Promise<{ error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: step } = await admin
    .from('workflow_steps')
    .select('notes, template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title)')
    .eq('id', stepId)
    .single();

  if (!step) return { error: 'Etapa não encontrada' };

  const tplStep = Array.isArray(step.template_step) ? step.template_step[0] : step.template_step;
  const currentNotes = (step.notes as StepNote[]) ?? [];
  const newNote: StepNote = {
    author_id: user.id,
    author_name: profile.full_name ?? 'Usuário',
    step_title: tplStep?.title ?? 'Etapa',
    text: noteText.trim(),
    created_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from('workflow_steps')
    .update({ notes: [...currentNotes, newNote] })
    .eq('id', stepId);

  if (error) return { error: error.message };
  return {};
}
```

- [ ] **Step 5: Implementar `createWorkItemAction`**

Adicionar após `addNoteToStepAction`:

```typescript
export async function createWorkItemAction(data: {
  reference: string;
  title: string;
  template_id: string;
  start_step_order?: number;
  initial_note?: string;
}): Promise<{ instance_id?: string; error?: string }> {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Apenas admin pode criar itens' };
  }

  const supabase = await createClient();

  // Verificar se template existe
  const admin = createAdminClient();
  const { data: tmpl } = await admin
    .from('workflow_templates')
    .select('id')
    .eq('id', data.template_id)
    .eq('is_active', true)
    .single();

  if (!tmpl) return { error: 'Fluxo não encontrado ou inativo' };

  // Se start_step_order > 1, não há suporte via RPC — usar step padrão (1)
  // O RPC start_workflow_instance sempre inicia na primeira etapa
  const { data: instanceId, error } = await supabase.rpc('start_workflow_instance', {
    p_template_id: data.template_id,
    p_reference: data.reference.trim(),
    p_title: data.title.trim() || null,
  });

  if (error) return { error: error.message };

  // Se pede step diferente do 1, avançar automaticamente até o step desejado
  // (implementação futura — por ora sempre inicia no step 1)

  // Adicionar nota inicial se fornecida
  if (data.initial_note?.trim() && instanceId) {
    const { data: firstStep } = await admin
      .from('workflow_steps')
      .select('id')
      .eq('instance_id', instanceId as string)
      .order('step_order')
      .limit(1)
      .single();

    if (firstStep) {
      await addNoteToStepAction(firstStep.id, data.initial_note);
    }
  }

  return { instance_id: instanceId as string };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/workflows/actions/pasta-actions.ts
git commit -m "feat(workflows): pasta-actions — getPastaView, advanceWithNote, addNote, createWorkItem"
```

---

## Task 3: Componente `WorkItemCard`

**Files:**
- Create: `src/features/workflows/components/work-item-card.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
'use client';

import { useState } from 'react';
import { Clock, AlertTriangle, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView;
  onAdvance: (stepId: string, note?: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

function useTimer(item: WorkItemView) {
  const now = Date.now();
  const slaMs = item.sla_hours * 3_600_000;

  if (!item.due_at) {
    return { label: 'Sem prazo', color: 'text-muted-foreground', state: 'none' as const };
  }

  const dueMs = new Date(item.due_at).getTime();
  const diffMs = dueMs - now;

  if (diffMs < 0) {
    const h = Math.floor(Math.abs(diffMs) / 3_600_000);
    const m = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
    return {
      label: `+${h}h ${m}min além do prazo`,
      color: 'text-red-500',
      state: 'overdue' as const,
    };
  }

  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  const pct = diffMs / slaMs;

  if (pct <= 0.3) {
    return { label: `${h}h ${m}min restantes`, color: 'text-yellow-500', state: 'warning' as const };
  }
  return { label: `${h}h ${m}min restantes`, color: 'text-emerald-500', state: 'ok' as const };
}

export function WorkItemCard({ item, onAdvance, onOpenNotes }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const timer = useTimer(item);

  const borderClass =
    timer.state === 'overdue'
      ? 'border-red-500 bg-red-500/5'
      : timer.state === 'warning'
        ? 'border-yellow-500/50'
        : 'border-border';

  async function handleAdvance() {
    setAdvancing(true);
    await onAdvance(item.step_id);
    setAdvancing(false);
  }

  const lastNote = item.notes.at(-1);

  return (
    <div className={`relative rounded-lg border p-3 space-y-2 min-w-[180px] max-w-[220px] flex-1 ${borderClass}`}>
      {timer.state === 'overdue' && (
        <Badge variant="destructive" className="absolute -top-2 -right-2 text-[9px] px-1.5 py-0.5 flex items-center gap-0.5">
          <AlertTriangle className="w-2.5 h-2.5" /> ATRASADO
        </Badge>
      )}

      <div>
        <p className="text-sm font-bold leading-tight">{item.reference}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {item.step_title}
        </p>
      </div>

      <div className={`flex items-center gap-1 text-[11px] font-semibold ${timer.color}`}>
        <Clock className="w-3 h-3 flex-shrink-0" />
        {timer.label}
      </div>

      {item.due_at && (
        <p className="text-[10px] text-muted-foreground">
          Prazo: {new Date(item.due_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {lastNote && (
        <div className="text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1.5 border-l-2 border-border line-clamp-2">
          <span className="font-medium">{lastNote.step_title}:</span> {lastNote.text}
        </div>
      )}

      <div className="flex gap-1.5 pt-1">
        {item.next_step_title ? (
          <Button
            size="sm"
            className="flex-1 h-7 text-[10px] font-bold gap-1"
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
cd squados && npx tsc --noEmit 2>&1 | grep work-item-card
```

Expected: sem erros neste arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/components/work-item-card.tsx
git commit -m "feat(workflows): WorkItemCard com timer colorido e botão avançar"
```

---

## Task 4: Componente `ItemNotesSheet`

**Files:**
- Create: `src/features/workflows/components/item-notes-sheet.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { WorkItemView, StepNote } from '../actions/pasta-actions';
import { addNoteToStepAction } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView | null;
  onClose: () => void;
  onNoteAdded: () => void;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function ItemNotesSheet({ item, onClose, onNoteAdded }: Props) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!item || !note.trim()) return;
    setSaving(true);
    await addNoteToStepAction(item.step_id, note.trim());
    setNote('');
    setSaving(false);
    onNoteAdded();
  }

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            {item?.reference} — Diário de Bordo
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {/* Linha do tempo de notas */}
          {(item?.notes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma anotação ainda.</p>
          ) : (
            <div className="space-y-2">
              {(item?.notes ?? []).map((n: StepNote, i: number) => (
                <div key={i} className="border-l-2 border-border pl-3 py-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-primary">{n.step_title}</span>
                    <span className="text-[10px] text-muted-foreground">{fmtDate(n.created_at)}</span>
                    <span className="text-[10px] text-muted-foreground">· {n.author_name}</span>
                  </div>
                  <p className="text-sm">{n.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar nova nota */}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-semibold">Adicionar observação</p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Descreva o que foi feito nesta etapa…"
              rows={3}
              className="text-sm resize-none"
            />
            <Button
              size="sm"
              disabled={!note.trim() || saving}
              onClick={handleSave}
            >
              {saving ? 'Salvando…' : 'Salvar nota'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/workflows/components/item-notes-sheet.tsx
git commit -m "feat(workflows): ItemNotesSheet — diário de bordo por item"
```

---

## Task 5: Componente `NewItemModal`

**Files:**
- Create: `src/features/workflows/components/new-item-modal.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createWorkItemAction } from '../actions/pasta-actions';

interface Template {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  templates: Template[];
  onClose: () => void;
  onCreated: () => void;
}

export function NewItemModal({ open, templates, onClose, onCreated }: Props) {
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!reference.trim() || !title.trim() || !templateId) {
      setError('Referência, título e fluxo são obrigatórios.');
      return;
    }
    setSaving(true);
    setError('');
    const result = await createWorkItemAction({
      reference: reference.trim(),
      title: title.trim(),
      template_id: templateId,
      initial_note: note.trim() || undefined,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReference('');
    setTitle('');
    setTemplateId('');
    setNote('');
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Item de Trabalho</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reference">Referência</Label>
            <Input
              id="reference"
              placeholder="PA.0234"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Título / Descrição</Label>
            <Textarea
              id="title"
              placeholder="Descreva o item de trabalho…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Fluxo de destino</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o fluxo…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Observação inicial (opcional)</Label>
            <Textarea
              id="note"
              placeholder="Contexto ou detalhes para o primeiro responsável…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={saving} onClick={handleCreate}>
              {saving ? 'Criando…' : 'Criar item'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/workflows/components/new-item-modal.tsx
git commit -m "feat(workflows): NewItemModal — criação de item por admin"
```

---

## Task 6: Componente Principal `WorkflowPastaView`

**Files:**
- Create: `src/features/workflows/components/workflow-pasta-view.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getPastaViewAction, advanceWithNoteAction } from '../actions/pasta-actions';
import type { PastaView, WorkItemView } from '../actions/pasta-actions';
import { WorkItemCard } from './work-item-card';
import { ItemNotesSheet } from './item-notes-sheet';
import { NewItemModal } from './new-item-modal';

interface Template {
  id: string;
  name: string;
}

interface Props {
  templates: Template[];
}

export function WorkflowPastaView({ templates }: Props) {
  const [pastas, setPastas] = useState<PastaView[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notesItem, setNotesItem] = useState<WorkItemView | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await getPastaViewAction();
    if (r.pastas) setPastas(r.pastas);
    if (r.isAdmin !== undefined) setIsAdmin(r.isAdmin);
    setLoading(false);
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Fluxos de Trabalho</h2>
        {isAdmin && (
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setNewItemOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Novo Item
          </Button>
        )}
      </div>

      {pastas.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
          {isAdmin
            ? 'Nenhum item ativo nos fluxos. Crie um novo item acima.'
            : 'Você não tem itens ativos no momento.'}
        </div>
      ) : (
        pastas.map((pasta) => {
          const overdueCount = pasta.items.filter(
            (i) => i.due_at && new Date(i.due_at).getTime() < Date.now()
          ).length;

          return (
            <div
              key={pasta.template_id}
              className="border rounded-xl p-4 space-y-3 bg-card"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="font-semibold text-sm">{pasta.template_name}</span>
                {overdueCount > 0 ? (
                  <Badge variant="destructive" className="text-[10px]">
                    {overdueCount} em atraso
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    {pasta.items.length} em andamento
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {pasta.items.map((item) => (
                  <WorkItemCard
                    key={item.step_id}
                    item={item}
                    onAdvance={handleAdvance}
                    onOpenNotes={setNotesItem}
                  />
                ))}
              </div>
            </div>
          );
        })
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
cd squados && npx tsc --noEmit 2>&1 | grep -E "workflow-pasta|work-item|item-notes|new-item"
```

Expected: sem erros nos arquivos novos.

- [ ] **Step 3: Commit**

```bash
git add src/features/workflows/components/workflow-pasta-view.tsx
git commit -m "feat(workflows): WorkflowPastaView — container de pastas com polling e modais"
```

---

## Task 7: Atualizar Página de Operações

**Files:**
- Modify: `src/app/(app)/operations/page.tsx`

- [ ] **Step 1: Substituir imports e adicionar busca de templates**

Substituir o bloco de imports no topo:

```typescript
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Factory, AlertTriangle, Bot } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { WorkflowPastaView } from '@/features/workflows/components/workflow-pasta-view';
```

- [ ] **Step 2: Adicionar busca de templates ativos no `Promise.all`**

Alterar o `Promise.all` existente para incluir templates:

```typescript
const [{ data: allSectors }, { data: allUsers }, { data: templates }] = await Promise.all([
  admin.from('sectors').select('id, name, slug, icon, is_active').eq('is_active', true).order('name'),
  admin.from('profiles').select('id, full_name, sector_id').eq('status', 'active').is('deleted_at', null).order('full_name'),
  admin.from('workflow_templates').select('id, name').eq('is_active', true).order('name'),
]);
```

- [ ] **Step 3: Substituir o JSX da página inteira**

Substituir o `return (...)` do componente:

```typescript
return (
  <div className="p-6 space-y-6 max-w-7xl mx-auto">
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Factory className="w-6 h-6 text-primary" />
        Operações da Fábrica
      </h1>
      <p className="text-sm text-muted-foreground">
        Fluxo produtivo LIVE: do pedido à expedição
      </p>
    </div>

    {/* Fluxos de Trabalho — destaque principal */}
    <WorkflowPastaView templates={(templates ?? []) as { id: string; name: string }[]} />

    {/* Setores Produtivos — compacto */}
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground mb-2">Setores Produtivos</h2>
      <div className="flex flex-wrap gap-2">
        {PRODUCTION_FLOW.map((step) => {
          const stats = getSectorStats(step.slug);
          return (
            <div
              key={step.slug}
              className="flex items-center gap-1.5 bg-muted/40 border rounded-full px-3 py-1 text-xs"
            >
              <span className={`w-2 h-2 rounded-full ${step.color} flex-shrink-0`} />
              <span className="font-medium">{step.label}</span>
              <span className="text-muted-foreground">{stats.users}u</span>
              {stats.hasAgent && <Bot className="w-3 h-3 text-emerald-500" />}
            </div>
          );
        })}
      </div>
    </div>

    {/* Setores de Suporte */}
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground mb-2">Setores de Suporte</h2>
      <div className="flex flex-wrap gap-2">
        {SUPPORT_SECTORS.map((sector) => {
          const stats = getSectorStats(sector.slug);
          return (
            <div key={sector.slug} className="bg-muted/30 border rounded px-2.5 py-1 text-xs text-muted-foreground">
              {sector.label}
              {stats.hasAgent && <Bot className="w-3 h-3 text-emerald-500 inline ml-1" />}
            </div>
          );
        })}
      </div>
    </div>

    {/* Alerta: setores sem conhecimento */}
    {(() => {
      const withoutKnowledge = PRODUCTION_FLOW.filter((s) => getSectorStats(s.slug).docs === 0);
      if (withoutKnowledge.length === 0) return null;
      return (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">
                {withoutKnowledge.length} setor{withoutKnowledge.length > 1 ? 'es' : ''} produtivo{withoutKnowledge.length > 1 ? 's' : ''} sem conhecimento
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {withoutKnowledge.map((s) => s.label).join(', ')}
                {' — '}importe SOPs e procedimentos para ativar os agentes.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    })()}
  </div>
);
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep operations
```

Expected: sem erros.

- [ ] **Step 5: Verificar lint**

```bash
cd squados && npx next lint src/app/\\(app\\)/operations/page.tsx
```

Expected: sem erros críticos.

- [ ] **Step 6: Commit**

```bash
git add src/app/'(app)'/operations/page.tsx
git commit -m "feat(operations): WorkflowPastaView como destaque, setores compactos como pills"
```

---

## Task 8: API Endpoint para Integração Externa

**Files:**
- Create: `src/app/api/workflow-items/route.ts`

- [ ] **Step 1: Criar o endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

// API key simples via env var — pode evoluir para tabela de keys no futuro
const API_KEY = process.env.WORKFLOW_API_KEY;

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-api-key');
  if (!API_KEY || key !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { reference, title, template_id, start_step_order, initial_note } = body as {
    reference?: string;
    title?: string;
    template_id?: string;
    start_step_order?: number;
    initial_note?: string;
  };

  if (!reference || !title || !template_id) {
    return NextResponse.json(
      { error: 'reference, title e template_id são obrigatórios' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verificar template ativo
  const { data: tmpl } = await admin
    .from('workflow_templates')
    .select('id')
    .eq('id', template_id)
    .eq('is_active', true)
    .single();

  if (!tmpl) {
    return NextResponse.json({ error: 'Fluxo não encontrado ou inativo' }, { status: 404 });
  }

  // Criar instância via RPC
  const { data: instanceId, error } = await admin.rpc('start_workflow_instance', {
    p_template_id: template_id,
    p_reference: String(reference).trim(),
    p_title: String(title).trim(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Adicionar nota inicial se fornecida
  let currentStepId: string | null = null;
  if (instanceId) {
    const { data: firstStep } = await admin
      .from('workflow_steps')
      .select('id, due_at, template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title)')
      .eq('instance_id', instanceId as string)
      .order('step_order')
      .limit(1)
      .single();

    currentStepId = firstStep?.id ?? null;

    if (firstStep && initial_note) {
      const tplStep = Array.isArray(firstStep.template_step)
        ? firstStep.template_step[0]
        : firstStep.template_step;
      await admin
        .from('workflow_steps')
        .update({
          notes: [{
            author_id: 'system',
            author_name: 'LivePosVenda',
            step_title: tplStep?.title ?? 'Início',
            text: String(initial_note).trim(),
            created_at: new Date().toISOString(),
          }],
        })
        .eq('id', firstStep.id);
    }

    return NextResponse.json({
      instance_id: instanceId,
      reference,
      current_step_id: currentStepId,
      due_at: (firstStep as { due_at?: string } | null)?.due_at ?? null,
    });
  }

  return NextResponse.json({ error: 'Falha ao criar instância' }, { status: 500 });
}
```

- [ ] **Step 2: Adicionar `WORKFLOW_API_KEY` ao `.env.local`**

```bash
echo "WORKFLOW_API_KEY=gerar-chave-segura-aqui" >> squados/.env.local
```

- [ ] **Step 3: Testar endpoint localmente**

```bash
curl -X POST http://localhost:3000/api/workflow-items \
  -H "Content-Type: application/json" \
  -H "x-api-key: gerar-chave-segura-aqui" \
  -d '{"reference":"PA.TEST","title":"Teste integração","template_id":"ID-DO-FLUXO-POSV"}'
```

Expected: `{"instance_id":"...","reference":"PA.TEST","current_step_id":"...","due_at":"..."}`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/workflow-items/route.ts
git commit -m "feat(api): POST /api/workflow-items — endpoint para integração LivePosVenda"
```

---

## Task 9: Teste Visual e Ajustes Finais

- [ ] **Step 1: Iniciar servidor de desenvolvimento**

```bash
cd squados && npm run dev
```

- [ ] **Step 2: Acessar `/operations?alerts-test=1`**

Verificar:
- Beacons ATRASO e FLUXO aparecem na tarja superior
- Seção Fluxos de Trabalho é o destaque principal da página
- Setores Produtivos aparecem como linha de pills compactas
- Setores de Suporte aparecem como pills menores

- [ ] **Step 3: Criar item de teste como admin**

Clicar em "+ Novo Item", preencher referência/título/fluxo e confirmar.
Verificar que o item aparece na pasta correspondente com timer rodando.

- [ ] **Step 4: Avançar item**

Clicar em "Avançar →". Verificar:
- Item some da pasta do usuário atual
- (Em outra sessão) item aparece para o próximo responsável
- Badge FLUXO acende na tarja do próximo usuário

- [ ] **Step 5: Adicionar nota**

Clicar em "📝", escrever observação, salvar. Verificar que a nota aparece no card e no sheet.

- [ ] **Step 6: Verificar typecheck e lint final**

```bash
cd squados && npx tsc --noEmit && npx next lint
```

Expected: sem erros.

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "feat(operations): WorkflowPastaView completo — pastas, timer, diário, avançar, API"
```

---

## Self-Review

**Spec coverage:**
- ✅ Layout invertido: Fluxos grande, Setores pequeno
- ✅ Pastas por fluxo, itens do usuário apenas
- ✅ Admin vê tudo; usuário vê sua etapa
- ✅ Timer verde/amarelo/vermelho com SLA da template_step
- ✅ Diário de bordo (notes jsonb) acumula por etapa
- ✅ Botão avançar → completa etapa + DM workspace + badge FLUXO
- ✅ Modal "Novo Item" (admin)
- ✅ API endpoint POST /api/workflow-items com x-api-key
- ✅ Gatilho: aprovação no LivePosVenda → POST no endpoint

**Fora do escopo confirmado:**
- Webhook no LivePosVenda (integração end-to-end)
- Notificação por e-mail ao avançar
- Histórico de itens concluídos
