# Workflow Step Attachments Design

**Data:** 2026-04-17

## Goal

Permitir que usuários anexem arquivos a etapas de itens de trabalho no fluxo (workflow), com capacidade de marcar cada anexo individualmente como "Seguir" ou "Não Seguir". O fluxo do item nunca é bloqueado pela decisão — apenas o anexo carrega esse status.

## Architecture

### Banco de Dados

Nova tabela `workflow_step_attachments`:

```sql
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
  decision      text CHECK (decision IN ('seguir', 'nao_seguir')),  -- NULL = pendente
  decided_by    uuid REFERENCES profiles(id),
  decided_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);
```

**Índices:**
- `idx_wsa_instance` on `instance_id`
- `idx_wsa_step` on `step_id`

**RLS:**
- `SELECT`: participantes do `instance_id` (via `workflow_steps.assignee_id` ou `started_by`) + admin/master_admin
- `INSERT`: `auth.uid() = uploaded_by` + usuário autenticado
- `UPDATE` (somente `decision`, `decided_by`, `decided_at`): qualquer participante do fluxo

### Storage

Bucket `workflow-attachments`:
- Privado, 20 MB por arquivo
- Path: `{instance_id}/{step_id}/{uuid}-{filename}`
- RLS upload: autenticado
- RLS download: autenticado (validado via signed URL gerada pelo server)

## Components

### Server Actions — `workflow-attachment-actions.ts`

```typescript
uploadWorkflowAttachmentAction(params: {
  instanceId: string;
  stepId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ error?: string }>

getWorkflowAttachmentsAction(instanceId: string): Promise<WorkflowAttachment[]>

decideWorkflowAttachmentAction(
  attachmentId: string,
  decision: 'seguir' | 'nao_seguir'
): Promise<{ error?: string }>

getSignedAttachmentUrlAction(storagePath: string): Promise<string | null>
```

### Interface TypeScript

```typescript
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
```

### UI — Modificação em `item-notes-sheet.tsx`

Nova seção **"Anexos"** adicionada abaixo da seção de notas (Diário de Bordo):

**Upload:**
- Botão com ícone 📎 "Anexar arquivo" disponível para o assignee da etapa atual
- File input oculto, clique no botão dispara seleção
- Ao selecionar: upload para `workflow-attachments/{instance_id}/{step_id}/{uuid}-{filename}`, depois chama `uploadWorkflowAttachmentAction`
- Loading state no botão durante upload

**Lista de anexos:**
- Busca todos os anexos via `getWorkflowAttachmentsAction(instanceId)` — histórico completo do item
- Cada item exibe:
  - Ícone de arquivo + nome (truncado) + tamanho formatado
  - Badge com etapa de origem (ex: "Etapa 2 — Emitir NF")
  - Nome do uploader + data
  - Se `decision === null`: botões **Seguir** (verde) e **Não Seguir** (vermelho)
  - Se `decision === 'seguir'`: badge verde "Seguiu" + nome do decididor
  - Se `decision === 'nao_seguir'`: badge vermelho "Não Seguiu" + nome do decididor
- Qualquer participante do fluxo pode decidir sobre qualquer anexo pendente (não restrito à etapa atual)

## Data Flow

1. Usuário clica 📎 no sheet do item
2. Seleciona arquivo → upload para Supabase Storage
3. `uploadWorkflowAttachmentAction` insere registro na tabela
4. Sheet re-fetcha `getWorkflowAttachmentsAction(instanceId)` e exibe
5. Outro usuário (etapa seguinte) abre o sheet do mesmo item
6. Vê o anexo com botões Seguir / Não Seguir
7. Clica → `decideWorkflowAttachmentAction` atualiza `decision`, `decided_by`, `decided_at`
8. Badge atualiza imediatamente (optimistic update)

## Constraints

- Upload máximo: 20 MB por arquivo
- Fluxo do item **nunca** é bloqueado pela decisão do anexo
- Decisão é irreversível (uma vez marcada, botões somem)
- Todos os anexos do `instance_id` são visíveis em todas as etapas
