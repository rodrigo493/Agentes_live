# Multi-setor por Usuário — Seleção de Setor no Login

**Data:** 2026-04-09  
**Status:** Aprovado

---

## Escopo

Permitir que um usuário seja atribuído a múltiplos setores (somente por admin/master_admin) e escolha em qual setor vai trabalhar ao fazer login. O setor ativo muda o contexto do sistema inteiro — dashboard, workspace e agente de IA tratam o usuário como funcionário daquele setor.

---

## Banco de Dados

### Nova tabela `user_sectors`

```sql
CREATE TABLE user_sectors (
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sector_id  UUID REFERENCES sectors(id)  ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES profiles(id),
  PRIMARY KEY (user_id, sector_id)
);
```

- Somente admin/master_admin pode inserir ou deletar registros (RLS).
- Migração: todos os `profiles.sector_id` existentes são copiados para `user_sectors`.

### Nova coluna `active_sector_id` em `profiles`

```sql
ALTER TABLE profiles
  ADD COLUMN active_sector_id UUID REFERENCES sectors(id);
```

- Contém o setor em que o usuário está trabalhando agora.
- O agente de IA lê `active_sector_id` de `profiles` para determinar o contexto do usuário.
- `profiles.sector_id` é mantido durante a transição para compatibilidade e pode ser deprecado numa versão futura.
- Ao trocar de setor, `active_sector_id` é atualizado via server action.

---

## Fluxo de Login

1. Usuário entra com email/senha normalmente.
2. Middleware pós-login verifica quantos setores o usuário tem em `user_sectors`.
3. **Se 1 setor:** define `active_sector_id` automaticamente e redireciona para `/dashboard`.
4. **Se 2+ setores:** redireciona para `/select-sector`.
5. **Se nenhum setor:** entra direto no dashboard sem contexto de setor (comportamento atual).

### Página `/select-sector`

- Rota protegida: requer autenticação mas não requer setor ativo.
- Lista os setores disponíveis para o usuário (lidos de `user_sectors JOIN sectors`).
- Ao clicar em um setor: chama `selectSectorAction(sectorId)` → atualiza `profiles.active_sector_id` → redireciona para `/dashboard`.
- Não tem botão "pular" — o usuário deve escolher um setor.

---

## Seletor de Setor no Header

- Componente `SectorSwitcher` visível no header global em todas as páginas autenticadas.
- Exibe nome e ícone do setor ativo.
- Visível apenas para usuários com 2+ setores atribuídos (quem tem 1 não precisa trocar).
- Ao abrir o dropdown: lista todos os setores do usuário, marcando o ativo.
- Ao selecionar outro setor: chama `selectSectorAction(sectorId)` → `router.refresh()` para recarregar a página no novo contexto.

---

## Gestão de Setores pelo Admin

### Na criação de usuário (`/users`)

- Seção "Setores permitidos" com checkboxes de todos os setores ativos.
- Obrigatoriedade: pelo menos 1 setor deve ser selecionado (se o admin quiser atribuir setores; caso contrário, deixa sem setor).
- Somente admin/master_admin veem essa seção.
- Ao criar: insere registros em `user_sectors` para cada setor marcado.

### Na edição de usuário (`/users` → editar)

- Mesma seção de checkboxes, pré-marcando os setores já atribuídos.
- Salvar: sincroniza `user_sectors` (insere novos, remove desmarcados).
- Se o setor removido for o `active_sector_id` atual: zera `active_sector_id` (forçará nova seleção no próximo acesso).

---

## Novas Server Actions

| Action | Arquivo | Descrição |
|--------|---------|-----------|
| `selectSectorAction(sectorId)` | `features/auth/actions/auth-actions.ts` | Atualiza `profiles.active_sector_id` para o usuário logado |
| `getUserSectorsAction(userId)` | `features/users/actions/user-actions.ts` | Retorna setores atribuídos a um usuário |
| `updateUserSectorsAction(userId, sectorIds[])` | `features/users/actions/user-actions.ts` | Sincroniza `user_sectors` para um usuário (admin only) |

---

## Novos Componentes

| Componente | Local | Responsabilidade |
|-----------|-------|-----------------|
| `SectorSwitcher` | `features/auth/components/` | Dropdown no header para trocar setor ativo |
| `SectorCheckboxList` | `features/users/components/` | Lista de checkboxes para admin atribuir setores |

### Página nova

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/select-sector` | `app/(auth)/select-sector/page.tsx` | Tela de seleção de setor pós-login |

---

## Componentes Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/app/(app)/layout.tsx` ou `header` | Adiciona `SectorSwitcher` no header global |
| `features/users/components/user-management.tsx` | Adiciona `SectorCheckboxList` na criação e edição |
| `src/proxy.ts` | Adiciona `/select-sector` em rotas públicas (autenticadas mas sem setor) |
| `shared/lib/rbac/guards.ts` | Redireciona para `/select-sector` se usuário tem 2+ setores e `active_sector_id` é null |

---

## Migração SQL

Um único arquivo de migration:
1. Cria tabela `user_sectors` com RLS.
2. Adiciona coluna `active_sector_id` em `profiles`.
3. Copia dados existentes de `profiles.sector_id` → `user_sectors`.
4. Define `active_sector_id = sector_id` para usuários que já tinham setor.

---

## Constraints

- `profiles.sector_id` mantido (não removido nesta versão) para evitar quebrar queries existentes.
- Sem hierarquia de setores por usuário — todos os setores atribuídos têm o mesmo peso.
- Sem notificação ao usuário quando um setor é removido pelo admin.
- Ícone/emoji do setor vem do campo `sectors.icon` (já existe na tabela).
