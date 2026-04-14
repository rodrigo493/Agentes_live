# Chat Agente — Melhorias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar voz ao chat do agente, suporte a imagens no conhecimento, e corrigir layout da lista de setores.

**Architecture:** Três melhorias independentes: (A) hook useVoiceChat integrado ao AgentChatShell com auto-TTS por modo de entrada; (B) upload de imagens junto com documentos de conhecimento, armazenadas em Supabase Storage, renderizadas inline no chat via marcador `[IMAGE:url]`; (C) ajuste de grid no SectorCheckboxList para itens não cortarem.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Storage, Claude API (vision context), shadcn/ui, useVoiceChat hook existente.

---

## File Structure

**Modificar:**
- `supabase/migrations/00036_knowledge_image_urls.sql` ← criar
- `src/features/knowledge/actions/knowledge-actions.ts` ← adicionar upload de imagens
- `src/features/sectors/components/sector-management.tsx` ← campo de imagens no form
- `src/features/agents/lib/agent-ai.ts` ← incluir image_urls no contexto
- `src/features/chat-agent/components/agent-chat-shell.tsx` ← voz + render imagens
- `src/features/users/components/sector-checkbox-list.tsx` ← fix layout

---

### Task 1: Migration — image_urls em knowledge_docs + bucket Storage

**Files:**
- Create: `supabase/migrations/00036_knowledge_image_urls.sql`

- [ ] **Step 1: Criar migration**

```sql
-- supabase/migrations/00036_knowledge_image_urls.sql
ALTER TABLE knowledge_docs
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

-- Criar bucket knowledge-images (público para leitura)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-images',
  'knowledge-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: leitura pública
CREATE POLICY "knowledge_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-images');

-- RLS: escrita autenticada
CREATE POLICY "knowledge_images_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-images' AND auth.role() = 'authenticated');

-- RLS: deleção autenticada
CREATE POLICY "knowledge_images_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-images' AND auth.role() = 'authenticated');
```

- [ ] **Step 2: Verificar TypeScript compila**

```bash
cd squados && npx tsc --noEmit
```
Esperado: zero erros

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00036_knowledge_image_urls.sql
git commit -m "feat(knowledge): migration image_urls em knowledge_docs + bucket storage"
```

---

### Task 2: Server action — upload de imagens no ingestDocumentAction

**Files:**
- Modify: `src/features/knowledge/actions/knowledge-actions.ts`

- [ ] **Step 1: Ler arquivo atual**

Ler `src/features/knowledge/actions/knowledge-actions.ts` para entender estrutura atual da `ingestDocumentAction`.

- [ ] **Step 2: Adicionar lógica de upload de imagens**

Substituir a função `ingestDocumentAction` pela versão abaixo (manter `getSectorKnowledgeAction` inalterada):

```typescript
export async function ingestDocumentAction(formData: FormData) {
  const { user, profile } = await getAuthenticatedUser();

  const raw = {
    sector_id: formData.get('sector_id') as string,
    title: formData.get('title') as string,
    content: formData.get('content') as string,
    doc_type: formData.get('doc_type') as string,
    tags: JSON.parse(formData.get('tags') as string || '[]'),
  };

  const parsed = ingestDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  if (!canAccessSector(profile.role, profile.sector_id, parsed.data.sector_id, 'ingestion', 'write')) {
    return { error: 'Sem permissão para ingerir conteúdo neste setor' };
  }

  const adminClient = createAdminClient();

  // 1. Salvar documento
  const { data, error } = await adminClient
    .from('knowledge_docs')
    .insert({
      sector_id: parsed.data.sector_id,
      title: parsed.data.title,
      content: parsed.data.content,
      doc_type: parsed.data.doc_type,
      uploaded_by: user.id,
      tags: parsed.data.tags,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // 2. Upload de imagens (se houver)
  const imageFiles = formData.getAll('images') as File[];
  const imageUrls: string[] = [];

  for (const file of imageFiles) {
    if (!file || file.size === 0) continue;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${parsed.data.sector_id}/${data.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
      .from('knowledge-images')
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (!uploadError) {
      const { data: urlData } = adminClient.storage
        .from('knowledge-images')
        .getPublicUrl(path);
      imageUrls.push(urlData.publicUrl);
    }
  }

  // 3. Atualizar image_urls se houver imagens
  if (imageUrls.length > 0) {
    await adminClient
      .from('knowledge_docs')
      .update({ image_urls: imageUrls })
      .eq('id', data.id);
  }

  // 4. Pipeline processed_memory
  await adminClient.from('processed_memory').insert({
    sector_id: parsed.data.sector_id,
    source_type: parsed.data.doc_type === 'transcript' ? 'transcript' : 'knowledge_doc',
    source_id: data.id,
    content: parsed.data.content,
    summary: parsed.data.title,
    user_id: user.id,
    tags: parsed.data.tags ?? [],
    relevance_score: 0.7,
    processing_status: 'completed',
    processed_at: new Date().toISOString(),
    context: {
      doc_id: data.id,
      doc_type: parsed.data.doc_type,
      channel: 'knowledge_ingestion',
    },
  });

  // 5. Auto-promover para knowledge_memory
  const autoPromoteTypes = ['procedure', 'manual'];
  if (autoPromoteTypes.includes(parsed.data.doc_type)) {
    await adminClient.from('knowledge_memory').insert({
      sector_id: parsed.data.sector_id,
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.doc_type === 'manual' ? 'technical' : 'procedure',
      confidence_score: 0.8,
      validated_by: user.id,
      validation_status: 'human_validated',
      tags: parsed.data.tags ?? [],
    });
  }

  await logAudit({
    userId: user.id,
    action: 'content_upload',
    resourceType: 'knowledge_doc',
    resourceId: data.id,
    details: {
      title: parsed.data.title,
      doc_type: parsed.data.doc_type,
      sector_id: parsed.data.sector_id,
      image_count: imageUrls.length,
    },
  });

  return { success: true, data: { ...data, image_urls: imageUrls } };
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error
```
Esperado: zero erros

- [ ] **Step 4: Commit**

```bash
git add src/features/knowledge/actions/knowledge-actions.ts
git commit -m "feat(knowledge): upload de imagens no ingestDocumentAction"
```

---

### Task 3: Formulário de ingestão — campo de upload de imagens

**Files:**
- Modify: `src/features/sectors/components/sector-management.tsx`

- [ ] **Step 1: Ler arquivo atual**

Ler `src/features/sectors/components/sector-management.tsx` linhas 1-80 para verificar imports existentes.

- [ ] **Step 2: Adicionar estado para imagens**

Dentro de `SectorManagement`, após `const [docTags, setDocTags] = useState('');` adicionar:

```typescript
const [docImages, setDocImages] = useState<File[]>([]);
const [docImagePreviews, setDocImagePreviews] = useState<string[]>([]);
const docImagesInputRef = useRef<HTMLInputElement>(null);
```

Adicionar `useRef` ao import do React se não estiver:
```typescript
import { useState, useRef } from 'react';
```

Adicionar ícone `ImageIcon` ao import do lucide-react:
```typescript
import { ..., ImageIcon } from 'lucide-react';
```

- [ ] **Step 3: Limpar imagens ao abrir form**

Na função `openIngest`, após `setDocTags('');` adicionar:
```typescript
setDocImages([]);
setDocImagePreviews([]);
```

- [ ] **Step 4: Atualizar handleIngest para incluir imagens**

Na função `handleIngest`, após `formData.set('tags', ...)` adicionar:
```typescript
docImages.forEach((file) => formData.append('images', file));
```

Após `setDocTags('');` no success block adicionar:
```typescript
setDocImages([]);
setDocImagePreviews([]);
```

- [ ] **Step 5: Adicionar UI de upload de imagens no dialog de ingestão**

No JSX do dialog de ingestão, após o campo de tags e antes do `<Button type="submit">`, adicionar:

```tsx
<div className="space-y-2">
  <Label>Imagens do documento <span className="text-muted-foreground">(opcional)</span></Label>
  <input
    ref={docImagesInputRef}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    multiple
    className="hidden"
    onChange={(e) => {
      const files = Array.from(e.target.files ?? []);
      setDocImages((prev) => [...prev, ...files]);
      files.forEach((file) => {
        const url = URL.createObjectURL(file);
        setDocImagePreviews((prev) => [...prev, url]);
      });
      e.target.value = '';
    }}
  />
  {docImagePreviews.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {docImagePreviews.map((preview, i) => (
        <div key={i} className="relative group">
          <img
            src={preview}
            alt={`Imagem ${i + 1}`}
            className="w-20 h-20 object-cover rounded-lg border border-border"
          />
          <button
            type="button"
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => {
              setDocImages((prev) => prev.filter((_, idx) => idx !== i));
              setDocImagePreviews((prev) => prev.filter((_, idx) => idx !== i));
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )}
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="gap-2 text-xs"
    onClick={() => docImagesInputRef.current?.click()}
  >
    <ImageIcon className="w-3.5 h-3.5" />
    Adicionar imagens
  </Button>
</div>
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error
```
Esperado: zero erros

- [ ] **Step 7: Commit**

```bash
git add src/features/sectors/components/sector-management.tsx
git commit -m "feat(knowledge): campo de upload de imagens no formulário de ingestão"
```

---

### Task 4: generateAgentResponse — incluir image_urls no contexto

**Files:**
- Modify: `src/features/agents/lib/agent-ai.ts`

- [ ] **Step 1: Ler arquivo atual**

Ler `src/features/agents/lib/agent-ai.ts` linhas 91-122 (seção de busca de docs recentes).

- [ ] **Step 2: Incluir image_urls na query de knowledge_docs**

Na linha que busca `recentDocs` (cerca de linha 93), trocar `select('title, content, doc_type, tags')` por `select('title, content, doc_type, tags, image_urls')`.

- [ ] **Step 3: Incluir image_urls no contexto do agente**

No bloco que monta `knowledgeContext` para `recentDocs` (cerca de linhas 100-106), substituir por:

```typescript
if (recentDocs && recentDocs.length > 0) {
  knowledgeContext += '\n\n## Documentos do Setor\n';
  recentDocs.forEach((doc, i) => {
    knowledgeContext += `\n### ${i + 1}. ${doc.title} [${doc.doc_type}]\n`;
    knowledgeContext += (doc.content ?? '').substring(0, 3000) + '\n';
    const urls = (doc as any).image_urls as string[] | undefined;
    if (urls && urls.length > 0) {
      knowledgeContext += `\n**IMAGENS DESTE DOCUMENTO:**\n`;
      urls.forEach((url) => {
        knowledgeContext += `[IMAGE:${url}]\n`;
      });
    }
  });
}
```

- [ ] **Step 4: Adicionar instrução no system prompt para sempre inserir imagens**

No array que monta `fullSystemPrompt` (cerca de linha 109), após `'- Formate com markdown quando apropriado'`, adicionar:

```typescript
'- REGRA OBRIGATÓRIA DE IMAGENS: sempre que sua resposta se basear em um documento que contenha marcadores [IMAGE:url], você DEVE inserir TODOS esses marcadores na sua resposta, exatamente como aparecem no contexto (formato: [IMAGE:https://...]). Faça isso mesmo que o usuário não tenha pedido imagens. As imagens serão renderizadas automaticamente no chat.',
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error
```
Esperado: zero erros

- [ ] **Step 6: Commit**

```bash
git add src/features/agents/lib/agent-ai.ts
git commit -m "feat(knowledge): agent inclui image_urls no contexto e instrução de sempre inserir imagens"
```

---

### Task 5: AgentChatShell — renderizar imagens inline nas mensagens

**Files:**
- Modify: `src/features/chat-agent/components/agent-chat-shell.tsx`

- [ ] **Step 1: Ler trecho de renderização de mensagens**

Ler `src/features/chat-agent/components/agent-chat-shell.tsx` linhas 305-355 (bloco de renderização de mensagens).

- [ ] **Step 2: Criar função de parse de imagens**

Adicionar antes do `return` do componente (após os hooks/state):

```typescript
function renderMessageContent(content: string) {
  const parts = content.split(/(\[IMAGE:[^\]]+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[IMAGE:(.+)\]$/);
    if (match) {
      return (
        <img
          key={i}
          src={match[1]}
          alt="Imagem do documento"
          className="rounded-lg max-w-full mt-2 border border-border"
          style={{ maxHeight: '400px', objectFit: 'contain' }}
        />
      );
    }
    return part ? <span key={i} className="whitespace-pre-wrap">{part}</span> : null;
  });
}
```

- [ ] **Step 3: Usar renderMessageContent no balão de mensagem do agente**

No JSX onde renderiza `msg.content`, localizar a linha:
```tsx
<p className="text-sm whitespace-pre-wrap">{msg.content}</p>
```

Substituir por:
```tsx
<div className="text-sm">
  {renderMessageContent(msg.content)}
</div>
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error
```
Esperado: zero erros

- [ ] **Step 5: Commit**

```bash
git add src/features/chat-agent/components/agent-chat-shell.tsx
git commit -m "feat(chat): renderizar imagens inline nos balões do agente"
```

---

### Task 6: AgentChatShell — voz (mic button + auto-TTS)

**Files:**
- Modify: `src/features/chat-agent/components/agent-chat-shell.tsx`

- [ ] **Step 1: Ler imports e estado atual do componente**

Ler `src/features/chat-agent/components/agent-chat-shell.tsx` linhas 1-100.

- [ ] **Step 2: Adicionar imports necessários**

Adicionar ao bloco de imports existente:

```typescript
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useVoiceChat } from '../hooks/use-voice-chat';
```

- [ ] **Step 3: Adicionar hook e estado de modo de voz**

Após `const [sending, setSending] = useState(false);` adicionar:

```typescript
const voice = useVoiceChat();
const lastInputWasVoiceRef = useRef<boolean>(false);
```

Garantir que `useRef` está importado de `'react'`.

- [ ] **Step 4: Auto-speak quando agente responde por voz**

Após o bloco `useEffect` de auto-scroll, adicionar:

```typescript
const lastAgentMsgIdRef = useRef<string | null>(null);

useEffect(() => {
  if (!lastInputWasVoiceRef.current) return;
  const last = messages[messages.length - 1];
  if (!last || last.sender_type !== 'agent') return;
  if (lastAgentMsgIdRef.current === last.id) return;
  lastAgentMsgIdRef.current = last.id;
  voice.speak(last.content.replace(/\[IMAGE:[^\]]+\]/g, ''));
}, [messages, voice]);
```

Note: o `.replace(/\[IMAGE:[^\]]+\]/g, '')` remove os marcadores de imagem antes de falar — o agente não deve falar as URLs.

- [ ] **Step 5: Atualizar handleSend para rastrear modo de entrada**

Na função `handleSend`, logo antes de `setSending(true);` adicionar:
```typescript
lastInputWasVoiceRef.current = false;
```

- [ ] **Step 6: Criar handleMicClick**

Após `handleSend`, adicionar:

```typescript
async function handleMicClick() {
  if (voice.recording) {
    const text = await voice.stopRecording();
    if (text?.trim()) {
      lastInputWasVoiceRef.current = true;
      setInput('');
      setSending(true);
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          conversation_id: conversationId,
          sender_id: currentUserId,
          sender_type: 'user',
          content: text,
          content_type: 'text',
          metadata: {},
          reply_to_id: null,
          is_deleted: false,
          created_at: new Date().toISOString(),
          edited_at: null,
        },
      ]);
      const result = await sendAgentMessageAction(conversationId, text);
      if (result.data) {
        setMessages((prev) => {
          const realId = result.data!.userMessage.id;
          const alreadyExists = prev.some((m) => m.id === realId);
          if (alreadyExists) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => (m.id === tempId ? result.data!.userMessage : m));
        });
        if (result.data.agentMessage) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === result.data!.agentMessage!.id)) return prev;
            return [...prev, result.data!.agentMessage!];
          });
        }
      }
      setSending(false);
    }
  } else {
    await voice.startRecording();
  }
}
```

- [ ] **Step 7: Adicionar botão mic no input area**

Na área de input, localizar o `<Button onClick={handleSend} ...>` e adicionar o botão mic ANTES dele:

```tsx
<Button
  type="button"
  variant={voice.recording ? 'destructive' : 'outline'}
  size="icon"
  className="h-9 w-9 flex-shrink-0"
  onClick={handleMicClick}
  disabled={voice.transcribing || sending}
  title={voice.recording ? 'Parar e enviar' : 'Falar para o agente'}
>
  {voice.transcribing
    ? <Loader2 className="w-4 h-4 animate-spin" />
    : voice.recording
    ? <MicOff className="w-4 h-4" />
    : <Mic className="w-4 h-4" />}
</Button>
```

- [ ] **Step 8: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error
```
Esperado: zero erros

- [ ] **Step 9: Commit**

```bash
git add src/features/chat-agent/components/agent-chat-shell.tsx
git commit -m "feat(chat): voz no chat do agente — mic button + auto-TTS por modo de entrada"
```

---

### Task 7: Fix layout SectorCheckboxList

**Files:**
- Modify: `src/features/users/components/sector-checkbox-list.tsx`

- [ ] **Step 1: Ler arquivo atual**

Ler `src/features/users/components/sector-checkbox-list.tsx`.

- [ ] **Step 2: Aplicar correções de layout**

Substituir o componente `SectorCheckboxList` pelo seguinte:

```tsx
'use client';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface SectorCheckboxListProps {
  sectors: Sector[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function SectorCheckboxList({
  sectors,
  selectedIds,
  onChange,
  disabled = false,
}: SectorCheckboxListProps) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (sectors.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Nenhum setor ativo cadastrado.</p>
    );
  }

  return (
    <div className="w-full overflow-hidden grid grid-cols-2 sm:grid-cols-3 gap-2">
      {sectors.map((sector) => (
        <label
          key={sector.id}
          className={`w-full min-h-[60px] flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
            selectedIds.includes(sector.id)
              ? 'border-primary bg-primary/5'
              : 'border-input hover:bg-muted/30'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(sector.id)}
            onChange={() => toggle(sector.id)}
            disabled={disabled}
            className="accent-primary w-4 h-4 flex-shrink-0 mt-0.5"
          />
          {sector.icon && (
            <span className="text-base flex-shrink-0 leading-none mt-0.5">{sector.icon}</span>
          )}
          <span className="text-xs font-medium break-words leading-snug">{sector.name}</span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error
```
Esperado: zero erros

- [ ] **Step 4: Commit**

```bash
git add src/features/users/components/sector-checkbox-list.tsx
git commit -m "fix(users): sector checkboxes se alargam corretamente sem cortar borda"
```

---

---

### Task 8: Roteiros — cards de setor menores (metade do tamanho atual)

**Files:**
- Modify: `src/features/roteiros/components/roteiros-shell.tsx`

- [ ] **Step 1: Ler trecho do grid de setores**

Ler `src/features/roteiros/components/roteiros-shell.tsx` linhas 57-88 (grid de cards de setor).

- [ ] **Step 2: Reduzir tamanho dos cards**

Localizar o grid de setores (linha ~68):
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
```

Substituir pelo grid mais denso e cards mais compactos:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
```

Localizar o `<button>` do card de setor com `className="text-left border rounded-lg p-4 ...`:

Substituir `p-4` por `p-2.5` e `text-xl` (ícone) por `text-base`:
```tsx
<button
  key={s.id}
  onClick={() => openSector(s)}
  className="text-left border rounded-lg p-2.5 hover:border-primary hover:bg-muted/30 transition-colors"
>
  <div className="flex items-center gap-1.5">
    {s.icon && <span className="text-base">{s.icon}</span>}
    <h3 className="font-semibold text-xs leading-tight">{s.name}</h3>
  </div>
  <div className="mt-1.5 flex items-center gap-1.5">
    <Badge variant="secondary" className="text-[10px]">
      {counts[s.id] ?? 0} roteiro{(counts[s.id] ?? 0) === 1 ? '' : 's'}
    </Badge>
  </div>
</button>
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error
```
Esperado: zero erros

- [ ] **Step 4: Commit**

```bash
git add src/features/roteiros/components/roteiros-shell.tsx
git commit -m "fix(roteiros): cards de setor menores e mais compactos"
```

---

### Task 9: Mobile — botão de editar usuário visível e tabela responsiva

**Files:**
- Modify: `src/features/users/components/user-management.tsx`

- [ ] **Step 1: Ler trecho da tabela de usuários**

Ler `src/features/users/components/user-management.tsx` linhas 628-720 (tabela de usuários).

- [ ] **Step 2: Tornar tabela responsiva no mobile**

No `<Card>` que envolve a tabela (linha ~629), adicionar `overflow-x-auto`:
```tsx
<Card className="overflow-x-auto">
```

No `<table>`, adicionar `min-w-[600px]` para garantir scroll horizontal em vez de quebrar:
```tsx
<table className="w-full text-sm min-w-[600px]">
```

No cabeçalho e células de colunas menos importantes, ocultar no mobile com `hidden sm:table-cell`:

Localizar as células `<th>` de **Telefone** e **Status** e adicionar `className="hidden sm:table-cell ..."`:
```tsx
<th className="hidden sm:table-cell text-left p-3 font-medium text-muted-foreground">Status</th>
<th className="hidden sm:table-cell text-left p-3 font-medium text-muted-foreground">Telefone</th>
```

Nas `<td>` correspondentes de cada row, também adicionar `hidden sm:table-cell`:
```tsx
<td className="hidden sm:table-cell p-3">
  {/* conteúdo de status */}
</td>
<td className="hidden sm:table-cell p-3 text-xs text-muted-foreground">
  {user.phone || '—'}
</td>
```

No `<td>` de Ações (coluna do lápis), garantir que o botão seja sempre visível adicionando `sticky right-0 bg-card`:
```tsx
<td className="p-3 text-right sticky right-0 bg-card">
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8"
    onClick={() => openEdit(user)}
    title="Editar usuário"
  >
    <Pencil className="h-3.5 w-3.5" />
  </Button>
</td>
```

Fazer o mesmo na `<th>` de Ações:
```tsx
<th className="text-right p-3 font-medium text-muted-foreground sticky right-0 bg-muted/50">Ações</th>
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i error
```
Esperado: zero erros

- [ ] **Step 4: Commit**

```bash
git add src/features/users/components/user-management.tsx
git commit -m "fix(users): tabela responsiva no mobile com botão de editar sempre visível"
```

---

## Self-Review

**Spec coverage:**
- ✅ Feature A (voz): Tasks 6 — mic button, auto-TTS, lastInputWasVoice
- ✅ Feature B (imagens): Tasks 1-5 — migration, server action, form upload, agent context, render inline
- ✅ Feature C (layout): Task 7 — grid 2-3 cols, w-full, min-h-[60px], items-start
- ✅ Roteiros KPIs menores: Task 8 — grid mais denso, cards compactos
- ✅ Mobile edit user: Task 9 — colunas ocultas no mobile, lápis sticky sempre visível

**Placeholder scan:** Nenhum TBD ou TODO encontrado. Todos os blocos de código estão completos.

**Type consistency:**
- `image_urls: string[]` usado consistentemente em Tasks 1, 2, 4
- `renderMessageContent` definida na Task 5 e usada na mesma task
- `handleMicClick`, `lastInputWasVoiceRef`, `lastAgentMsgIdRef` definidos e usados na Task 6
- `voice` de `useVoiceChat()` — hook existente, interface já conhecida: `{ recording, transcribing, speaking, startRecording, stopRecording, speak, stopSpeaking }`
