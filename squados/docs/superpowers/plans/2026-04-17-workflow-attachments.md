# Workflow Step Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir anexar arquivos a etapas de workflow com decisão individual "Seguir" / "Não Seguir" por anexo, visível em todas as etapas do mesmo item de trabalho.

**Architecture:** Nova tabela `workflow_step_attachments` armazena metadados de arquivos por etapa; bucket Supabase `workflow-attachments` armazena os binários. O cliente faz upload direto para o Storage, depois registra via server action. O painel `item-notes-sheet.tsx` ganha uma seção "Anexos" abaixo das notas, com upload e botões de decisão por arquivo.

**Tech Stack:** Next.js 15 App Router, Supabase Storage + Postgres, shadcn/ui (Sheet, Button, Input), `createClient` (browser) para upload, `createAdminClient` (server) para queries, TypeScript.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `squados/supabase/migrations/00040_workflow_step_attachments.sql` | Criar | Tabela, índices, RLS, bucket |
| `squados/src/features/workflows/actions/workflow-attachment-actions.ts` | Criar | Server actions: upload register, list, decide, signed URL |
| `squados/src/features/workflows/components/workflow-attachments-section.tsx` | Criar | Seção de anexos isolada: upload + lista + decisão |
| `squados/src/features/workflows/components/item-notes-sheet.tsx` | Modificar | Integrar `WorkflowAttachmentsSection` abaixo das notas |

---

### Task 1: Database Migration

**Files:**
- Create: `squados/supabase/migrations/00040_workflow_step_attachments.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- Migration 00040: workflow_step_attachments table + RLS + storage bucket

CREATE TABLE workflow_step_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   uuid NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_id       uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  file_name     text NOT NULL,
  file_size     integer NOT NULL,
  mime_type     text NOT NULL,
  storage_path  text NOT NULL,
  uploaded_by   uuid NOT NULL REFERENCES profiles(id),
  uploaded_at   timestamptz DEFAULT now(),
  decision      text CHECK (decision IN ('seguir', 'nao_seguir')),
  decided_by    uuid REFERENCES profiles(id),
  decided_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_wsa_instance ON workflow_step_attachments(instance_id);
CREATE INDEX idx_wsa_step     ON workflow_step_attachments(step_id);

ALTER TABLE workflow_step_attachments ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ver (server actions validam via admin client)
CREATE POLICY "authenticated_select" ON workflow_step_attachments
  FOR SELECT USING (auth.role() = 'authenticated');

-- Uploader insere somente seus próprios registros
CREATE POLICY "authenticated_insert" ON workflow_step_attachments
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

-- Qualquer autenticado pode atualizar decision (validação feita no server action)
CREATE POLICY "authenticated_update_decision" ON workflow_step_attachments
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Bucket workflow-attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workflow-attachments',
  'workflow-attachments',
  false,
  20971520,
  NULL
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated_upload_wf" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'workflow-attachments'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "authenticated_download_wf" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'workflow-attachments'
    AND auth.role() = 'authenticated'
  );
```

- [ ] **Step 2: Aplicar a migration no banco**

```bash
cd squados
npx supabase db query --linked -f supabase/migrations/00040_workflow_step_attachments.sql
```

Saída esperada: sem erros. Verificar no Supabase Dashboard → Table Editor que a tabela `workflow_step_attachments` aparece, e em Storage → Buckets que `workflow-attachments` foi criado.

- [ ] **Step 3: Commit**

```bash
git add squados/supabase/migrations/00040_workflow_step_attachments.sql
git commit -m "feat(db): workflow_step_attachments table and workflow-attachments storage bucket"
```

---

### Task 2: Server Actions

**Files:**
- Create: `squados/src/features/workflows/actions/workflow-attachment-actions.ts`

- [ ] **Step 1: Criar o arquivo de actions**

```typescript
'use server';

import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createClient } from '@/shared/lib/supabase/server';

export interface WorkflowAttachment {
  id: string;
  instance_id: string;
  step_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string;
  uploaded_at: string;
  decision: 'seguir' | 'nao_seguir' | null;
  decided_by: string | null;
  decided_at: string | null;
  uploader_name?: string;
  step_title?: string;
  decider_name?: string;
}

export async function uploadWorkflowAttachmentAction(params: {
  instanceId: string;
  stepId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const admin = createAdminClient();
  const { error } = await admin.from('workflow_step_attachments').insert({
    instance_id: params.instanceId,
    step_id: params.stepId,
    file_name: params.fileName,
    file_size: params.fileSize,
    mime_type: params.mimeType,
    storage_path: params.storagePath,
    uploaded_by: user.id,
  });

  if (error) return { error: error.message };
  return {};
}

export async function getWorkflowAttachmentsAction(
  instanceId: string
): Promise<WorkflowAttachment[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workflow_step_attachments')
    .select(`
      id, instance_id, step_id, file_name, file_size, mime_type,
      storage_path, uploaded_by, uploaded_at, decision, decided_by, decided_at,
      uploader:profiles!uploaded_by(full_name),
      decider:profiles!decided_by(full_name),
      step:workflow_steps!step_id(
        template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title)
      )
    `)
    .eq('instance_id', instanceId)
    .order('uploaded_at', { ascending: true });

  if (error) { console.error('[getWorkflowAttachmentsAction]', error.message); return []; }
  if (!data) return [];

  return data.map((d: any) => {
    const step = Array.isArray(d.step) ? d.step[0] : d.step;
    const tplStep = step
      ? (Array.isArray(step.template_step) ? step.template_step[0] : step.template_step)
      : null;
    return {
      id: d.id,
      instance_id: d.instance_id,
      step_id: d.step_id,
      file_name: d.file_name,
      file_size: d.file_size,
      mime_type: d.mime_type,
      storage_path: d.storage_path,
      uploaded_by: d.uploaded_by,
      uploaded_at: d.uploaded_at,
      decision: d.decision ?? null,
      decided_by: d.decided_by ?? null,
      decided_at: d.decided_at ?? null,
      uploader_name: (Array.isArray(d.uploader) ? d.uploader[0] : d.uploader)?.full_name ?? 'Usuário',
      step_title: tplStep?.title ?? 'Etapa',
      decider_name: d.decided_by
        ? ((Array.isArray(d.decider) ? d.decider[0] : d.decider)?.full_name ?? 'Usuário')
        : undefined,
    } satisfies WorkflowAttachment;
  });
}

export async function decideWorkflowAttachmentAction(
  attachmentId: string,
  decision: 'seguir' | 'nao_seguir'
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const admin = createAdminClient();

  // Garantir que não foi decidido ainda
  const { data: existing } = await admin
    .from('workflow_step_attachments')
    .select('decision')
    .eq('id', attachmentId)
    .single();

  if (!existing) return { error: 'Anexo não encontrado' };
  if (existing.decision !== null) return { error: 'Decisão já registrada' };

  const { error } = await admin
    .from('workflow_step_attachments')
    .update({
      decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', attachmentId);

  if (error) return { error: error.message };
  return {};
}

export async function getSignedAttachmentUrlAction(
  storagePath: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.storage
    .from('workflow-attachments')
    .createSignedUrl(storagePath, 3600);

  return data?.signedUrl ?? null;
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep workflow-attachment
```

Esperado: sem output (zero erros no arquivo novo).

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/actions/workflow-attachment-actions.ts
git commit -m "feat(workflows): server actions for workflow step attachments"
```

---

### Task 3: WorkflowAttachmentsSection Component

**Files:**
- Create: `squados/src/features/workflows/components/workflow-attachments-section.tsx`

Este componente é autocontido: recebe `instanceId` e `stepId`, faz fetch dos anexos, gerencia upload e decisões internamente. Isso mantém o `item-notes-sheet.tsx` limpo.

- [ ] **Step 1: Criar o componente**

```typescript
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Paperclip, FileText, Download, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/shared/lib/supabase/client';
import { toast } from 'sonner';
import {
  uploadWorkflowAttachmentAction,
  getWorkflowAttachmentsAction,
  decideWorkflowAttachmentAction,
  getSignedAttachmentUrlAction,
  type WorkflowAttachment,
} from '../actions/workflow-attachment-actions';

interface Props {
  instanceId: string;
  stepId: string;
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function WorkflowAttachmentsSection({ instanceId, stepId }: Props) {
  const [attachments, setAttachments] = useState<WorkflowAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);

  async function loadAttachments() {
    const data = await getWorkflowAttachmentsAction(instanceId);
    setAttachments(data);
  }

  useEffect(() => {
    loadAttachments();
  }, [instanceId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Arquivo deve ter no máximo 20 MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? '';
      const uniqueName = `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
      const storagePath = `${instanceId}/${stepId}/${uniqueName}`;

      const { error: storageError } = await supabase.storage
        .from('workflow-attachments')
        .upload(storagePath, file, { contentType: file.type });

      if (storageError) { toast.error('Erro no upload: ' + storageError.message); return; }

      const result = await uploadWorkflowAttachmentAction({
        instanceId,
        stepId,
        storagePath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      if (result.error) { toast.error(result.error); return; }

      toast.success('Arquivo anexado');
      await loadAttachments();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDecide(id: string, decision: 'seguir' | 'nao_seguir') {
    setDeciding(id);
    // Optimistic update
    setAttachments((prev) =>
      prev.map((a) => a.id === id ? { ...a, decision } : a)
    );
    try {
      const result = await decideWorkflowAttachmentAction(id, decision);
      if (result.error) {
        toast.error(result.error);
        // Revert
        setAttachments((prev) =>
          prev.map((a) => a.id === id ? { ...a, decision: null } : a)
        );
      } else {
        await loadAttachments();
      }
    } finally {
      setDeciding(null);
    }
  }

  async function handleDownload(attachment: WorkflowAttachment) {
    setDownloading(attachment.id);
    try {
      const url = await getSignedAttachmentUrlAction(attachment.storage_path);
      if (!url) { toast.error('Erro ao gerar link'); return; }
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      a.click();
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Anexos</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Paperclip className="h-3.5 w-3.5" />
          }
          {uploading ? 'Enviando…' : 'Anexar'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo ainda.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((a) => (
            <div key={a.id} className="rounded border bg-muted/30 p-2 space-y-1.5">
              {/* Cabeçalho do arquivo */}
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{a.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {a.step_title} · {a.uploader_name} · {fmtDate(a.uploaded_at)} · {formatSize(a.file_size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => handleDownload(a)}
                  disabled={downloading === a.id}
                  title="Baixar"
                >
                  {downloading === a.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Download className="h-3 w-3" />
                  }
                </Button>
              </div>

              {/* Decisão */}
              {a.decision === null ? (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] border-green-500/60 text-green-500 hover:bg-green-500/10"
                    onClick={() => handleDecide(a.id, 'seguir')}
                    disabled={deciding === a.id}
                  >
                    {deciding === a.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <><Check className="h-3 w-3 mr-1" />Seguir</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] border-red-500/60 text-red-500 hover:bg-red-500/10"
                    onClick={() => handleDecide(a.id, 'nao_seguir')}
                    disabled={deciding === a.id}
                  >
                    <><X className="h-3 w-3 mr-1" />Não Seguir</>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  {a.decision === 'seguir' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-500">
                      <Check className="h-3 w-3" /> Seguiu
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500">
                      <X className="h-3 w-3" /> Não Seguiu
                    </span>
                  )}
                  {a.decider_name && (
                    <span className="text-[10px] text-muted-foreground">· {a.decider_name}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep workflow-attachments-section
```

Esperado: sem output.

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-attachments-section.tsx
git commit -m "feat(workflows): WorkflowAttachmentsSection component with upload and seguir/nao-seguir decisions"
```

---

### Task 4: Integrar no ItemNotesSheet

**Files:**
- Modify: `squados/src/features/workflows/components/item-notes-sheet.tsx`

O arquivo atual tem 93 linhas. A mudança é pequena: importar o componente e adicioná-lo abaixo da seção de notas.

- [ ] **Step 1: Adicionar import do componente**

No topo do arquivo `item-notes-sheet.tsx`, após as importações existentes (linha 8), adicionar:

```typescript
import { WorkflowAttachmentsSection } from './workflow-attachments-section';
```

O bloco de imports completo ficará:

```typescript
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { WorkItemView, StepNote } from '../actions/pasta-actions';
import { addNoteToStepAction } from '../actions/pasta-actions';
import { WorkflowAttachmentsSection } from './workflow-attachments-section';
```

- [ ] **Step 2: Adicionar seção de anexos no JSX**

No final do `<div className="mt-4 space-y-3">`, após o fechamento do `<div className="border-t pt-3 space-y-2">` da seção de notas (após linha 88), adicionar o componente:

```tsx
          {/* Anexos */}
          {item && (
            <WorkflowAttachmentsSection
              instanceId={item.instance_id}
              stepId={item.step_id}
            />
          )}
```

O arquivo completo após a modificação:

```tsx
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { WorkItemView, StepNote } from '../actions/pasta-actions';
import { addNoteToStepAction } from '../actions/pasta-actions';
import { WorkflowAttachmentsSection } from './workflow-attachments-section';

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
    try {
      await addNoteToStepAction(item.step_id, note.trim());
      setNote('');
      onNoteAdded();
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setNote('');
    onClose();
  }

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && handleClose()}>
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
              {(item?.notes ?? []).map((n: StepNote) => (
                <div key={`${n.author_id}-${n.created_at}`} className="border-l-2 border-border pl-3 py-1">
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

          {/* Anexos */}
          {item && (
            <WorkflowAttachmentsSection
              instanceId={item.instance_id}
              stepId={item.step_id}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Verificar TypeScript (todos os arquivos)**

```bash
cd squados && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem output (zero erros).

- [ ] **Step 4: Commit**

```bash
git add squados/src/features/workflows/components/item-notes-sheet.tsx
git commit -m "feat(workflows): integrate WorkflowAttachmentsSection into item notes sheet"
```
