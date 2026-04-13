# Design Spec — Permissões de Navegação por Usuário

**Data:** 2026-04-13  
**Status:** Aprovado  
**Escopo:** Gestão de Usuários — controle de visibilidade da barra lateral por usuário

---

## Contexto

Hoje a visibilidade dos itens da barra lateral é determinada apenas pelo `minRole` estático em `navigation.ts`. Todos os usuários com o mesmo role veem os mesmos itens. O redesign permite que o admin configure quais itens cada usuário pode ver, com um conjunto padrão para novos usuários.

---

## Decisões de Design

| Questão | Decisão |
|---------|---------|
| Armazenamento | Coluna `allowed_nav_items TEXT[]` na tabela `profiles` |
| Valor padrão | `NULL` = conjunto padrão `['/workspace', '/email', '/chat']` |
| Admin/master_admin | Sempre veem tudo — coluna ignorada |
| Relação com minRole | Aditivo — minRole continua como teto de segurança |

---

## Banco de Dados

```sql
ALTER TABLE profiles
ADD COLUMN allowed_nav_items TEXT[] DEFAULT NULL;
```

- `NULL` → usa padrão: `/workspace`, `/email`, `/chat`
- Array preenchido → mostra exatamente esses hrefs (intersectado com minRole)
- Não requer índice — array pequeno, lido apenas no carregamento do layout

---

## Lógica de Navegação

No `sidebar.tsx`, o filtro de itens muda para:

```
mostrar item se:
  (1) role do usuário >= minRole do item   ← teto de segurança
  E
  (2) usuário é admin ou master_admin
      OU item.href está em profile.allowed_nav_items
      OU profile.allowed_nav_items é NULL
         E item.href está em ['/workspace', '/email', '/chat']
```

O `profile` já é carregado no layout server component — sem request extra, sem impacto de performance.

---

## UI — Modal de Criação/Edição de Usuário

Nova seção **"Acesso à barra lateral"** no modal, abaixo de Setores.

**Comportamento:**
- Visível apenas quando editando/criando usuários com role < admin
- Admin e master_admin não têm essa seção (veem tudo por padrão)
- Checkboxes listam apenas os itens que o role do usuário permite ver (baseado em minRole)
- Itens exclusivos de admin nunca aparecem nos checkboxes de roles menores

**Ao criar usuário:** pré-marcados por padrão:
- ✅ Workspace (`/workspace`)
- ✅ E-mails (`/email`)
- ✅ Chat com Agente (`/chat`)

**Ao editar usuário:** carrega `allowed_nav_items` atual do banco.

**Ao salvar:** `updateUserAction` persiste o array em `profiles.allowed_nav_items`.

---

## Componentes a modificar

| Componente | Mudança |
|-----------|---------|
| `squados/supabase/migrations/00026_user_nav_permissions.sql` | Criar — `ALTER TABLE profiles ADD COLUMN allowed_nav_items TEXT[]` |
| `src/shared/types/database.ts` | Adicionar `allowed_nav_items: string[] \| null` ao tipo `Profile` |
| `src/shared/components/layout/sidebar.tsx` | Atualizar lógica de filtro dos itens |
| `src/features/users/components/user-management.tsx` | Adicionar seção de checkboxes no modal criar/editar |
| `src/features/users/actions/user-actions.ts` | `createUserAction` e `updateUserAction` salvam `allowed_nav_items` |

---

## Fora de escopo

- Controle de acesso a rotas (só visibilidade no nav — RBAC protege as rotas)
- Templates de permissão reutilizáveis
- Notificação ao usuário quando permissões mudam
