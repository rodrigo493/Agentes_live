# Avatares de Usuário e Gestão de Grupos

**Data:** 2026-04-09  
**Status:** Aprovado

---

## Escopo

Duas funcionalidades independentes que compartilham a mesma infraestrutura de storage:

1. **Avatar de usuário** — upload de foto de perfil em Settings e na criação de usuário (admin)
2. **Gestão de grupos** — imagem no grupo, edição de nome/descrição/imagem e gerenciamento de membros (adicionar/remover) direto no workspace

---

## Infraestrutura de Storage

### Supabase Storage Buckets

Dois buckets públicos no Supabase:

| Bucket | Caminho dos objetos | Acesso |
|--------|-------------------|--------|
| `avatars` | `{userId}/{timestamp}.{ext}` | Público (leitura) |
| `group-avatars` | `{groupId}/{timestamp}.{ext}` | Público (leitura) |

**Regras:**
- Tamanho máximo: 2 MB
- Tipos aceitos: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Upload via client-side Supabase Storage SDK (não server action — evita serialização de File)
- Após upload bem-sucedido, salva a URL pública em `profiles.avatar_url` ou `groups.avatar_url` via server action

### Migração SQL

Um migration cria os dois buckets e as RLS policies:
- Qualquer usuário autenticado pode fazer upload no próprio path (`avatars/{userId}/`)
- Somente admin pode fazer upload em `group-avatars/`
- Leitura pública para ambos os buckets

---

## Funcionalidade 1 — Avatar de Usuário

### Settings (`/settings`)

- Componente `AvatarUpload` acima do campo "Nome" no `ProfileForm`
- Mostra avatar atual (ou iniciais se vazio)
- Botão "Trocar foto" abre `<input type="file" accept="image/*">`
- Botão "Remover" (só visível quando há foto) define `avatar_url = null`
- Upload direto no bucket `avatars` via Supabase client
- Após upload, chama `updateAvatarAction(url)` que salva em `profiles.avatar_url`
- Feedback visual: preview imediato da imagem selecionada antes do upload

### Criação de Usuário (Admin — modal `/users`)

- Campo opcional de foto no topo do formulário "Criar Usuário"
- Upload feito **após** criar o usuário (userId disponível só depois)
- Fluxo: criar usuário → se há foto selecionada → upload para `avatars/{newUserId}/` → `updateAvatarAction`
- Se o upload falhar, usuário já foi criado — foto fica em branco (não bloqueia criação)

---

## Funcionalidade 2 — Imagem de Grupo

### Criação de Grupo (modal no Workspace)

- Campo opcional de imagem antes do nome do grupo
- Upload para `group-avatars/{groupId}/` após criação do grupo (ID disponível depois)
- Mesmo fluxo da criação de usuário: criar → upload → salvar URL

### Exibição na sidebar do Workspace

- Se `group.avatar_url` existe: exibe imagem no lugar do ícone `#`
- Fallback: mantém ícone `#` com fundo violeta como hoje

---

## Funcionalidade 3 — Edição de Grupo

### Quem pode editar

Somente `admin` e `master_admin`.

### Ponto de entrada

Botão "✏️ Editar grupo" no header do chat do grupo (visível apenas para admin+).

### Modal de edição — 2 abas

#### Aba "Informações"
- Imagem atual + botão "Trocar imagem"
- Campo nome (obrigatório)
- Campo descrição (opcional)
- Botão "Salvar" → `updateGroupAction(groupId, { name, description, avatar_url })`

#### Aba "Membros"
- Lista de membros atuais com nome e role
- Botão "Remover" por membro (exceto o criador do grupo)
- Busca de usuários para adicionar
- Botão "Adicionar" → `addGroupMemberAction(groupId, userId)`
- Remoção → `removeGroupMemberAction(groupId, userId)`

### Atualização em tempo real

Após editar nome/imagem do grupo: atualiza estado local em `groups` e `conversations` no workspace-shell para refletir imediatamente sem reload.

---

## Novas Server Actions

| Action | Arquivo | Descrição |
|--------|---------|-----------|
| `updateAvatarAction(url)` | `settings-actions.ts` | Salva avatar_url no profile do usuário logado |
| `updateGroupAction(id, data)` | novo `group-actions.ts` em features/workspace | Atualiza nome, descrição, avatar_url |
| `addGroupMemberAction(groupId, userId)` | mesmo arquivo | Adiciona membro ao grupo e à conversa |
| `removeGroupMemberAction(groupId, userId)` | mesmo arquivo | Remove membro do grupo e da conversa |

### Nova API Route

`PUT /api/workspace/groups` — alternativa REST para operações de grupo (opcional, as server actions são suficientes).

---

## Novos Componentes

| Componente | Local | Responsabilidade |
|-----------|-------|-----------------|
| `AvatarUpload` | `features/settings/components/` | Upload + preview + remoção de avatar de usuário |
| `GroupAvatarUpload` | `features/workspace/components/` | Upload + preview de imagem de grupo |
| `EditGroupModal` | `features/workspace/components/` | Modal com abas Informações + Membros |

---

## Componentes Modificados

| Arquivo | Mudança |
|---------|---------|
| `features/settings/components/profile-form.tsx` | Adiciona `AvatarUpload` no topo |
| `features/users/components/user-management.tsx` | Adiciona foto opcional na criação |
| `features/workspace/components/workspace-shell.tsx` | Exibe avatar de grupo na sidebar; botão editar no header; integra `EditGroupModal` |

---

## Constraints

- Upload client-side (não server action) — `File` não é serializável
- Sem crop/resize no cliente — aceita a imagem como enviada
- Sem remoção de imagem de grupo — apenas troca
- Sem transferência de propriedade do grupo nesta versão
