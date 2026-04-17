# Workspace Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar envio de arquivos no workspace (DMs e grupos) e uma aba Documentos com cards por setor/grupo onde o destinatário acessa os arquivos recebidos.

**Architecture:** Arquivos são enviados como mensagens com `content_type: 'file'`, armazenados no bucket `workspace-documents` (Supabase Storage), e registrados na tabela `document_files` já criada. A aba `/documents` consulta essa tabela e agrupa por setor do remetente (DMs) ou por grupo.

**Tech Stack:** Next.js 15 App Router, Supabase Storage, Supabase SSR (server actions), shadcn/ui (Tabs, Card, Input, Button), lucide-react, TypeScript.

---

## File Map

| Ação | Arquivo |
|---|---|
| CREATE | `src/features/documents/actions/document-actions.ts` |
| CREATE | `src/features/documents/components/document-card.tsx` |
| CREATE | `src/features/documents/components/documents-page.tsx` |
| CREATE | `src/app/(app)/documents/page.tsx` |
| MODIFY | `src/config/navigation.ts` |
| MODIFY | `src/features/workspace/components/workspace-shell.tsx` |

---

## Contexto do Codebase

- **Padrão de server actions:** `'use server'`, `createClient()` de `@/shared/lib/supabase/server`, sempre chama `supabase.auth.getUser()` antes de qualquer query.
- **Supabase client no browser:** `createClient()` de `@/shared/lib/supabase/client` — usado em workspace-shell.tsx (já importado como `supabase`).
- **`active_sector_id`** fica em `profiles`. Ao enviar documento em DM, usar `profile.active_sector_id` como `sender_sector_id`.
- **Navigation:** `src/config/navigation.ts` define `NAV_ITEMS[]`. Adicionar entre Workspace e E-mails.
- **`FolderOpen`** já está importado em navigation.ts — reutilizar para Documents. Usar `FileText` para o ícone da página.
- **Upload storage:** usar `supabase.storage.from('workspace-documents').upload()` direto do client (mesmo padrão dos avatares de grupo em workspace-shell.tsx linha ~510).
- **Mensagens:** inseridas diretamente via `supabase.from('messages').insert()` no client (ver handleSend em workspace-shell.tsx:396).

---

## Task 1: Server Actions para Documentos

**Files:**
- Create: `src/features/documents/actions/document-actions.ts`

- [ ] **Step 1: Criar o arquivo com os tipos e imports**

```typescript
// src/features/documents/actions/document-actions.ts
'use server';

import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export interface DocumentFile {
  id: string;
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_sector_id: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  created_at: string;
  sender_name?: string;
  sector_name?: string;
  group_name?: string;
}

export interface DmDocumentGroup {
  sector_id: string | null;
  sector_name: string;
  files: DocumentFile[];
}

export interface GroupDocumentGroup {
  conversation_id: string;
  group_name: string;
  files: DocumentFile[];
}
```

- [ ] **Step 2: Implementar `sendDocumentAction`**

Adicionar após os tipos no mesmo arquivo:

```typescript
export async function sendDocumentAction(params: {
  conversationId: string;
  messageId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_sector_id, sector_id')
    .eq('id', user.id)
    .single();

  const sectorId = profile?.active_sector_id ?? profile?.sector_id ?? null;

  const { error } = await supabase.from('document_files').insert({
    message_id: params.messageId,
    conversation_id: params.conversationId,
    sender_id: user.id,
    sender_sector_id: sectorId,
    file_name: params.fileName,
    file_size: params.fileSize,
    mime_type: params.mimeType,
    storage_path: params.storagePath,
  });

  if (error) return { error: error.message };
  return {};
}
```

- [ ] **Step 3: Implementar `getMyDocumentsAction`**

```typescript
export async function getMyDocumentsAction(): Promise<DmDocumentGroup[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('document_files')
    .select(`
      id, message_id, conversation_id, sender_id, sender_sector_id,
      file_name, file_size, mime_type, storage_path, created_at,
      sender:profiles!sender_id(full_name),
      sector:sectors!sender_sector_id(name),
      conversation:conversations!conversation_id(type)
    `)
    .neq('sender_id', user.id)
    .order('created_at', { ascending: false });

  if (!data) return [];

  // Filtrar apenas DMs
  const dmFiles = data.filter((d: any) => d.conversation?.type === 'dm');

  // Agrupar por setor
  const grouped = new Map<string, DmDocumentGroup>();
  for (const d of dmFiles) {
    const key = d.sender_sector_id ?? 'sem-setor';
    const sectorName = (d.sector as any)?.name ?? 'Sem Setor';
    if (!grouped.has(key)) {
      grouped.set(key, { sector_id: d.sender_sector_id, sector_name: sectorName, files: [] });
    }
    grouped.get(key)!.files.push({
      ...d,
      sender_name: (d.sender as any)?.full_name ?? 'Usuário',
      sector_name: sectorName,
    });
  }

  return Array.from(grouped.values());
}
```

- [ ] **Step 4: Implementar `getGroupDocumentsAction`**

```typescript
export async function getGroupDocumentsAction(): Promise<GroupDocumentGroup[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('document_files')
    .select(`
      id, message_id, conversation_id, sender_id, sender_sector_id,
      file_name, file_size, mime_type, storage_path, created_at,
      sender:profiles!sender_id(full_name),
      conversation:conversations!conversation_id(type, title)
    `)
    .order('created_at', { ascending: false });

  if (!data) return [];

  const groupFiles = data.filter((d: any) => d.conversation?.type === 'group');

  const grouped = new Map<string, GroupDocumentGroup>();
  for (const d of groupFiles) {
    const key = d.conversation_id;
    const groupName = (d.conversation as any)?.title ?? 'Grupo';
    if (!grouped.has(key)) {
      grouped.set(key, { conversation_id: key, group_name: groupName, files: [] });
    }
    grouped.get(key)!.files.push({
      ...d,
      sender_name: (d.sender as any)?.full_name ?? 'Usuário',
      group_name: groupName,
    });
  }

  return Array.from(grouped.values());
}
```

- [ ] **Step 5: Implementar `getSignedDownloadUrlAction`**

```typescript
export async function getSignedDownloadUrlAction(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.storage
    .from('workspace-documents')
    .createSignedUrl(storagePath, 3600);

  return data?.signedUrl ?? null;
}
```

- [ ] **Step 6: Verificar TypeScript**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep "document-actions"
```
Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/features/documents/actions/document-actions.ts
git commit -m "feat(documents): server actions para envio e consulta de documentos"
```

---

## Task 2: Navigation — Adicionar item Documentos

**Files:**
- Modify: `src/config/navigation.ts` (linha 34)

- [ ] **Step 1: Adicionar item no NAV_ITEMS**

Em `src/config/navigation.ts`, adicionar após a linha do Workspace (`{ label: 'Workspace', ... }`):

```typescript
// Mudar FolderOpen para FileText para não conflitar com Conhecimento
```

Substituir o bloco de imports:
```typescript
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Building2,
  FolderOpen,
  FileText,
  Brain,
  Shield,
  Users,
  UsersRound,
  Settings,
  BarChart3,
  Mic,
  Eye,
  Factory,
  Mail,
  Workflow,
  CalendarDays,
  ClipboardList,
  BookOpen,
} from 'lucide-react';
```

E em `NAV_ITEMS`, adicionar após Workspace:
```typescript
{ label: 'Workspace', href: '/workspace', icon: MessageSquare, minRole: 'viewer' },
{ label: 'Documentos', href: '/documents', icon: FileText, minRole: 'viewer' },
{ label: 'E-mails', href: '/email', icon: Mail, minRole: 'viewer' },
```

- [ ] **Step 2: Adicionar `/documents` ao DEFAULT_NAV_ITEMS**

```typescript
const DEFAULT_NAV_ITEMS = ['/workspace', '/documents', '/email', '/chat', '/calendario'];
```

- [ ] **Step 3: Atualizar DEFAULT_NAV em user-management.tsx**

Em `src/features/users/components/user-management.tsx` linha 39:
```typescript
const DEFAULT_NAV = ['/workspace', '/documents', '/email', '/chat', '/calendario'];
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "navigation"
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/config/navigation.ts src/features/users/components/user-management.tsx
git commit -m "feat(nav): adicionar item Documentos na navegação lateral"
```

---

## Task 3: WorkspaceShell — Botão de upload e render de file messages

**Files:**
- Modify: `src/features/workspace/components/workspace-shell.tsx`

- [ ] **Step 1: Adicionar imports necessários**

No topo do arquivo, na lista de imports do lucide-react (linha ~12), adicionar `Paperclip`:
```typescript
import {
  Send, Users, X, Check, Pencil, UserPlus, Trash2, Camera, Paperclip,
  // ... demais já existentes
} from 'lucide-react';
```

E adicionar o import da server action:
```typescript
import { sendDocumentAction } from '@/features/documents/actions/document-actions';
```

- [ ] **Step 2: Adicionar estado para upload**

Após `const [sending, setSending] = useState(false);` (linha ~116), adicionar:
```typescript
const [uploading, setUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Implementar `handleFileUpload`**

Adicionar após `handleSend` (após linha ~454):

```typescript
async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !activeChat) return;

  if (file.size > 20 * 1024 * 1024) {
    toast.error('Arquivo muito grande. Limite: 20 MB');
    return;
  }

  setUploading(true);
  try {
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `${activeChat.conversationId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('workspace-documents')
      .upload(path, file);

    if (uploadError) {
      toast.error('Erro ao enviar arquivo');
      return;
    }

    const metadata = {
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      storage_path: path,
    };

    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeChat.conversationId,
        sender_id: currentUserId,
        sender_type: 'user',
        content: `📄 ${file.name}`,
        content_type: 'file',
        metadata,
      })
      .select()
      .single();

    if (msgError || !msg) {
      toast.error('Erro ao registrar mensagem');
      return;
    }

    await sendDocumentAction({
      conversationId: activeChat.conversationId,
      messageId: msg.id,
      storagePath: path,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
    });

    setMessages((prev) => [
      ...prev,
      { ...msg, sender: { id: currentUserId, full_name: currentUserName, avatar_url: null } },
    ]);
  } finally {
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
}
```

- [ ] **Step 4: Adicionar botão 📎 e input hidden no JSX do input area**

Substituir o bloco `{/* Input */}` (linhas ~984–1004):

```tsx
{/* Input */}
<div className="border-t border-border p-4">
  <div className="flex gap-2">
    <Button
      variant="ghost"
      size="icon"
      className="flex-shrink-0 h-9 w-9"
      onClick={() => fileInputRef.current?.click()}
      disabled={uploading || !activeChat}
      title="Enviar arquivo"
    >
      <Paperclip className="h-4 w-4" />
    </Button>
    <input
      ref={fileInputRef}
      type="file"
      className="hidden"
      onChange={handleFileUpload}
    />
    <Textarea
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Digite sua mensagem..."
      className="min-h-[44px] max-h-32 resize-none"
      rows={1}
    />
    <Button
      onClick={handleSend}
      disabled={sending || uploading || !input.trim()}
      size="icon"
      className="flex-shrink-0"
    >
      <Send className="h-4 w-4" />
    </Button>
  </div>
</div>
```

- [ ] **Step 5: Renderizar mensagens de arquivo**

Dentro do `.map((msg) => { ... })` (linha ~937), substituir o bloco da mensagem:

Localizar a linha:
```tsx
<p className="text-sm whitespace-pre-wrap">{msg.content}</p>
```

Substituir por:
```tsx
{msg.content_type === 'file' && msg.metadata ? (
  <FileMessageBubble
    fileName={(msg.metadata as any).file_name}
    fileSize={(msg.metadata as any).file_size}
    storagePath={(msg.metadata as any).storage_path}
  />
) : (
  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
)}
```

- [ ] **Step 6: Implementar `FileMessageBubble` no mesmo arquivo**

Adicionar antes do `export function WorkspaceShell`:

```tsx
function FileMessageBubble({
  fileName,
  fileSize,
  storagePath,
}: {
  fileName: string;
  fileSize: number;
  storagePath: string;
}) {
  const supabase = createClient();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const { data } = await supabase.storage
        .from('workspace-documents')
        .createSignedUrl(storagePath, 3600);
      if (data?.signedUrl) {
        const a = document.createElement('a');
        a.href = data.signedUrl;
        a.download = fileName;
        a.click();
      }
    } finally {
      setDownloading(false);
    }
  }

  const kb = fileSize < 1024 * 1024
    ? `${(fileSize / 1024).toFixed(0)} KB`
    : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="flex items-center gap-2 py-1">
      <FileText className="h-5 w-5 flex-shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        <p className="text-[10px] opacity-60">{kb}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 flex-shrink-0"
        onClick={handleDownload}
        disabled={downloading}
        title="Baixar"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
```

Adicionar `Download, FileText` aos imports do lucide-react.

- [ ] **Step 7: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "workspace-shell"
```
Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/features/workspace/components/workspace-shell.tsx
git commit -m "feat(workspace): botão de upload de arquivo e render de file messages"
```

---

## Task 4: DocumentCard — Card de setor/grupo com lista e busca

**Files:**
- Create: `src/features/documents/components/document-card.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/features/documents/components/document-card.tsx
'use client';

import { useState, useTransition } from 'react';
import { FileText, Download, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getSignedDownloadUrlAction } from '../actions/document-actions';
import type { DocumentFile } from '../actions/document-actions';
import { toast } from 'sonner';

interface Props {
  title: string;
  icon: React.ReactNode;
  files: DocumentFile[];
}

export function DocumentCard({ title, icon, files }: Props) {
  const [query, setQuery] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = files.filter((f) =>
    f.file_name.toLowerCase().includes(query.toLowerCase())
  );

  function handleDownload(file: DocumentFile) {
    setDownloading(file.id);
    startTransition(async () => {
      try {
        const url = await getSignedDownloadUrlAction(file.storage_path);
        if (!url) { toast.error('Erro ao gerar link'); return; }
        const a = document.createElement('a');
        a.href = url;
        a.download = file.file_name;
        a.click();
      } finally {
        setDownloading(null);
      }
    });
  }

  function formatSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="rounded-lg border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <span className="text-xs text-muted-foreground">{files.length}</span>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nesta pasta…"
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto max-h-64 px-3 py-2 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {query ? 'Nenhum arquivo encontrado.' : 'Nenhum documento ainda.'}
          </p>
        ) : (
          filtered.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{f.file_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {f.sender_name} · {new Date(f.created_at).toLocaleDateString('pt-BR')} · {formatSize(f.file_size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => handleDownload(f)}
                disabled={downloading === f.id || isPending}
                title="Baixar"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "document-card"
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/documents/components/document-card.tsx
git commit -m "feat(documents): componente DocumentCard com lista e busca"
```

---

## Task 5: DocumentsPage — Página com tabs Meus Documentos / Grupos

**Files:**
- Create: `src/features/documents/components/documents-page.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/features/documents/components/documents-page.tsx
'use client';

import { FolderOpen, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DocumentCard } from './document-card';
import type { DmDocumentGroup, GroupDocumentGroup } from '../actions/document-actions';

interface Props {
  dmGroups: DmDocumentGroup[];
  groupGroups: GroupDocumentGroup[];
}

export function DocumentsPage({ dmGroups, groupGroups }: Props) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">Documentos</h1>

      <Tabs defaultValue="dm">
        <TabsList>
          <TabsTrigger value="dm">Meus Documentos</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
        </TabsList>

        <TabsContent value="dm" className="mt-4">
          {dmGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento recebido ainda.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {dmGroups.map((g) => (
                <DocumentCard
                  key={g.sector_id ?? 'sem-setor'}
                  title={g.sector_name}
                  icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />}
                  files={g.files}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          {groupGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento em grupos ainda.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupGroups.map((g) => (
                <DocumentCard
                  key={g.conversation_id}
                  title={g.group_name}
                  icon={<Users className="h-4 w-4 text-muted-foreground" />}
                  files={g.files}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "documents-page"
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/documents/components/documents-page.tsx
git commit -m "feat(documents): componente DocumentsPage com tabs DM e Grupos"
```

---

## Task 6: Rota `/documents`

**Files:**
- Create: `src/app/(app)/documents/page.tsx`

- [ ] **Step 1: Criar a página server component**

```tsx
// src/app/(app)/documents/page.tsx
import { getMyDocumentsAction, getGroupDocumentsAction } from '@/features/documents/actions/document-actions';
import { DocumentsPage } from '@/features/documents/components/documents-page';

export default async function DocumentsRoute() {
  const [dmGroups, groupGroups] = await Promise.all([
    getMyDocumentsAction(),
    getGroupDocumentsAction(),
  ]);

  return <DocumentsPage dmGroups={dmGroups} groupGroups={groupGroups} />;
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "documents/page"
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/documents/page.tsx
git commit -m "feat(documents): rota /documents com server component"
```

---

## Self-Review

**Spec coverage:**
- ✅ Botão 📎 no workspace (Task 3)
- ✅ Upload para `workspace-documents` bucket (Task 3)
- ✅ Mensagem `content_type: 'file'` criada (Task 3)
- ✅ Registro em `document_files` com `sender_sector_id` (Task 1)
- ✅ Download via signed URL → browser Downloads (Tasks 3, 4)
- ✅ Aba Documentos com cards por setor para DMs (Tasks 4, 5)
- ✅ Cards por grupo para mensagens de grupo (Tasks 4, 5)
- ✅ Busca client-side dentro de cada card (Task 4)
- ✅ Nav item no sidebar (Task 2)
- ✅ Remetente não vê na aba Documentos — RLS na migration 00039

**Placeholder scan:** Nenhum TBD, TODO ou "implement later" detectado.

**Type consistency:**
- `DocumentFile` definido em Task 1 e usado em Tasks 4 e 5 — consistente
- `DmDocumentGroup`, `GroupDocumentGroup` definidos em Task 1 e usados em Tasks 5 e 6 — consistente
- `sendDocumentAction` params definidos em Task 1 e chamados em Task 3 — consistente
- `getSignedDownloadUrlAction(storagePath: string)` definido em Task 1 e chamado em Task 4 — consistente
