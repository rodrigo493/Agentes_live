# Spec: Workspace Documents — Envio e Biblioteca por Setor

**Data:** 2026-04-16
**Status:** Aprovado para implementação

---

## Contexto

Usuários do SquadOS precisam trocar arquivos no workspace (DMs e grupos) e ter acesso organizado a todos os documentos recebidos numa biblioteca central. Documentos de DMs ficam organizados por setor do remetente; documentos de grupos ficam organizados por grupo.

---

## Abordagem

Attachment acoplado ao sistema de mensagens: arquivo enviado cria uma mensagem com `content_type: 'file'` e um registro em `document_files`. A aba Documentos consulta essa tabela com RLS para exibir apenas o que o usuário recebeu.

---

## Banco de Dados

### Bucket Supabase Storage: `workspace-documents`

| Propriedade | Valor |
|---|---|
| Acesso | Privado (autenticado) |
| Limite por arquivo | 20 MB |
| Tipos permitidos | Qualquer (PDF, DOCX, XLSX, imagens, ZIP, etc.) |
| Path padrão | `{conversationId}/{uuid}-{filename}` |

### Tabela `document_files`

```sql
CREATE TABLE document_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        uuid REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id   uuid REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         uuid REFERENCES profiles(id),
  sender_sector_id  uuid REFERENCES sectors(id),  -- setor ativo do remetente no envio
  file_name         text NOT NULL,
  file_size         integer NOT NULL,              -- bytes
  mime_type         text NOT NULL,
  storage_path      text NOT NULL,                 -- caminho no bucket workspace-documents
  created_at        timestamptz DEFAULT now()
);
```

### RLS

- **DM:** visível apenas ao destinatário — `conversation.type = 'dm'` E `sender_id != auth.uid()` E usuário é participante da conversa
- **Grupo:** visível a todos os membros do grupo — `conversation.type = 'group'` E usuário é participante da conversa
- **Remetente:** não vê o arquivo na aba Documentos (apenas no histórico do chat via mensagem)
- **Admin/master_admin:** vê todos

---

## Componente de Envio no Workspace

**Arquivo:** `src/features/workspace/components/workspace-shell.tsx` (modificar input existente)

### UI

Botão 📎 (ícone `Paperclip` do lucide-react) ao lado esquerdo do campo de texto. Input `<input type="file" hidden>` acionado pelo clique.

### Fluxo de upload

1. Usuário clica em 📎 e seleciona arquivo
2. Validação: tamanho ≤ 20 MB (toast de erro se exceder)
3. Upload para `workspace-documents/{conversationId}/{uuid}-{originalName}`
4. Cria mensagem com:
   ```json
   {
     "content": "arquivo: {filename}",
     "content_type": "file",
     "metadata": {
       "file_name": "relatorio-abril.pdf",
       "file_size": 245000,
       "mime_type": "application/pdf",
       "storage_path": "{conversationId}/{uuid}-relatorio-abril.pdf"
     }
   }
   ```
5. Cria registro em `document_files` com `sender_sector_id` = setor ativo do usuário
6. Estado de loading no botão durante upload; erro mostrado via toast

### Server action: `sendDocumentAction`

```typescript
// src/features/workspace/actions/document-actions.ts
sendDocumentAction(params: {
  conversationId: string
  file: File
  activeSectorId: string
}): Promise<{ messageId: string; documentId: string }>
```

---

## Exibição da Mensagem de Arquivo no Chat

**Arquivo:** `src/features/workspace/components/message-thread.tsx` (modificar para tratar `content_type: 'file'`)

Renderização para mensagens com `content_type === 'file'`:

```
┌─────────────────────────────────────┐
│ 📄 relatorio-abril.pdf   245 KB     │
│ João Silva · 14/04 às 10:30    [⬇]  │
└─────────────────────────────────────┘
```

Clique em ⬇:
1. Gera URL assinada via `supabase.storage.from('workspace-documents').createSignedUrl(path, 3600)`
2. Cria `<a href={signedUrl} download>` e dispara clique programaticamente
3. Browser faz download para pasta Downloads do sistema operacional do usuário

---

## Página Documentos (`/documents`)

**Arquivo:** `src/app/(app)/documents/page.tsx`
**Componente principal:** `src/features/documents/components/documents-page.tsx`

### Navegação

Nova entrada no sidebar entre Workspace e Email, com ícone `FolderOpen`.

### Layout

Duas tabs: **"Meus Documentos"** e **"Grupos"**

---

### Tab "Meus Documentos"

Documentos recebidos via DM, agrupados por setor do remetente.

**Query:** `document_files` onde `sender_id != user.id` E `conversation.type = 'dm'` E usuário é participante — agrupado por `sender_sector_id`.

**Layout:** grid de cards, um por setor:

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ 📁 Pós-venda          [3]    │  │ 📁 Engenharia         [1]    │
│ ┌─ busca... ──────────────┐  │  │ ┌─ busca... ──────────────┐  │
│ │                         │  │  │ │                         │  │
│ │ 📄 relatorio.pdf 245KB  │  │  │ │ 📄 planta-v3.dwg 1.2MB  │  │
│ │    João · 14/04    [⬇]  │  │  │ │    Ana · 12/04     [⬇]  │  │
│ │ 📄 orcamento.xlsx 80KB  │  │  │ └─────────────────────────┘  │
│ │    Maria · 16/04   [⬇]  │  │  └──────────────────────────────┘
│ └─────────────────────────┘  │
└──────────────────────────────┘
```

**Busca dentro do card:** input de texto filtra por `file_name` (case-insensitive, client-side dentro do card já carregado).

---

### Tab "Grupos"

Documentos enviados em grupos dos quais o usuário é membro, agrupados por grupo.

**Query:** `document_files` onde `conversation.type = 'group'` E usuário é participante — agrupado por `conversation_id`.

**Layout:** idêntico ao de "Meus Documentos", mas cabeçalho do card usa nome do grupo com ícone 👥.

---

### Busca dentro do card

Campo `input` no topo de cada card (placeholder "Buscar nesta pasta…"). Filtra a lista de documentos do card por `file_name.toLowerCase().includes(query)`. Sem debounce necessário (filtragem client-side).

---

## Server Actions

**Arquivo:** `src/features/documents/actions/document-actions.ts`

```typescript
getMyDocumentsAction(): Promise<{
  byDM: { sectorId: string; sectorName: string; files: DocumentFile[] }[]
  byGroup: { groupId: string; groupName: string; files: DocumentFile[] }[]
}>

getSignedDownloadUrl(storagePath: string): Promise<string>
```

---

## Sidebar

**Arquivo:** `src/shared/components/layout/sidebar.tsx` (modificar)

Adicionar item entre Workspace e Email:

```typescript
{ href: '/documents', icon: FolderOpen, label: 'Documentos' }
```

Sem badge de contagem nesta entrega.

---

## Fora do Escopo (esta entrega)

- Preview inline de imagens e PDFs
- Badge de "novos documentos" no sidebar
- Exclusão de documentos
- Compartilhamento de documento com múltiplos usuários ao mesmo tempo
- Download em lote (zip de pasta inteira)
- Ordenação por data/tamanho/nome

---

## Migration SQL

```sql
-- Tabela document_files
CREATE TABLE document_files (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        uuid REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id   uuid REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         uuid REFERENCES profiles(id),
  sender_sector_id  uuid REFERENCES sectors(id),
  file_name         text NOT NULL,
  file_size         integer NOT NULL,
  mime_type         text NOT NULL,
  storage_path      text NOT NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_document_files_conversation ON document_files(conversation_id);
CREATE INDEX idx_document_files_sender ON document_files(sender_id);
CREATE INDEX idx_document_files_sector ON document_files(sender_sector_id);

-- RLS
ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;

-- Destinatário de DM vê o arquivo
CREATE POLICY "dm_recipient_can_view" ON document_files
  FOR SELECT USING (
    sender_id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND c.type = 'dm'
        AND auth.uid() = ANY(c.participant_ids)
    )
  );

-- Membros de grupo veem arquivos do grupo
CREATE POLICY "group_member_can_view" ON document_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND c.type = 'group'
        AND auth.uid() = ANY(c.participant_ids)
    )
  );

-- Admin vê tudo
CREATE POLICY "admin_view_all" ON document_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );

-- Qualquer usuário autenticado pode inserir (o sistema valida via server action)
CREATE POLICY "authenticated_insert" ON document_files
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
```
