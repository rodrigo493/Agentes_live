# Design Spec — Catálogo Global de Processos

**Data:** 2026-04-13  
**Status:** Aprovado  
**Escopo:** Módulo de Produção — redesign dos Processos

---

## Contexto

Hoje os processos são criados inline na tela de produção, vinculados individualmente a cada usuário (`assigned_to`). Isso exige que o admin recrie o mesmo processo para cada operador. O redesign separa o **catálogo global de processos** (gerenciado pelo admin) da **atribuição por usuário** (fluxo de produção individual).

---

## Decisões de Design

| Questão | Decisão |
|---------|---------|
| Modelo de referência | **Referência viva** — mudanças no catálogo refletem imediatamente nos fluxos dos usuários |
| Quem pode criar/editar processos | Apenas `admin` e `master_admin` |
| Modelo do fluxo | **Base por setor + customização individual** — admin seleciona processos do catálogo para cada usuário |
| Estrutura de dados | **Tabelas novas** (`process_catalog` + `user_process_assignments`) |

---

## Banco de Dados

### Novas tabelas

```sql
-- Catálogo global de processos
process_catalog (
  id UUID PK,
  sector_id UUID FK → sectors (nullable — processos sem setor agrupados em "Sem setor"),
  title TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT 'violet',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID FK → profiles,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Mídias do catálogo (imagens e vídeos por processo)
process_catalog_media (
  id UUID PK,
  catalog_process_id UUID FK → process_catalog ON DELETE CASCADE,
  type TEXT CHECK ('image' | 'video'),
  url TEXT NOT NULL,
  caption TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ
)

-- Atribuição de processos a usuários (fluxo de produção individual)
user_process_assignments (
  id UUID PK,
  user_id UUID FK → profiles NOT NULL,
  catalog_process_id UUID FK → process_catalog NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'violet',
  created_by UUID FK → profiles,
  created_at TIMESTAMPTZ,
  UNIQUE (user_id, catalog_process_id)
)
```

### RLS

- `process_catalog`: SELECT para todos autenticados; INSERT/UPDATE/DELETE só admin+
- `process_catalog_media`: SELECT para todos autenticados; INSERT/DELETE só admin+
- `user_process_assignments`: SELECT para o próprio usuário (`user_id = auth.uid()`) e admins; INSERT/DELETE só admin+

### Migração

Os registros existentes em `production_processes` são migrados para `process_catalog` com `sector_id = NULL`. A tabela `production_processes` é mantida (sem novos dados) para não quebrar histórico. Os vínculos de `assigned_to` são migrados para `user_process_assignments`. Os registros de `production_media` são migrados para `process_catalog_media`.

### Storage

O bucket `production-media` existente é reutilizado para upload de imagens do catálogo. Nenhum bucket novo é necessário.

---

## Aba "Processos" — nova rota `/processos`

**Navegação:** inserida logo após "Operações" com `minRole: 'admin'` — visível apenas para `admin` e `master_admin`.

**Layout — accordion por setor:**
- Cada setor ativo aparece como um bloco expansível com nome, ícone e contagem de processos
- Processos sem setor ficam num grupo "Sem setor" no final
- Dentro de cada setor: botões grandes clicáveis (nome do processo)
- Clicar num processo abre modal de **detalhe** com título, descrição e mídias (carrossel de imagens/vídeos)

**Admin vê adicionalmente:**
- Botão **"+ Novo Processo"** no topo da página
- Botões de editar ✏️ e excluir 🗑️ em cada processo
- Ao criar/editar: escolhe setor, título, descrição, cor, e gerencia mídias (upload de imagens, URL de vídeo YouTube/Vimeo/MP4)

**Operador:** não tem acesso à aba Processos — vê os processos apenas no próprio fluxo de produção.

---

## Tela de Produção — mudanças no fluxo de processos

### Admin (visão por usuário)

- Grid de usuários e gerenciamento de tarefas: **sem mudanças**
- Calendário: **sem mudanças**
- Fluxo de processos: os cards agora referenciam o catálogo
- Botão **"+ Processo"** abre o **modal de seleção do catálogo**
- Cada card exibe um ícone de remoção 🗑️ visível apenas para admin (remove o processo do fluxo daquele usuário)

### Modal de seleção ("+Processo")

Duas abas no topo:

**Aba "Grupos"**
- Lista de setores em accordion
- Cada setor tem botão **"+ Grupo inteiro"** que seleciona todos os processos daquele setor de uma vez
- Checkboxes individuais para selecionar processos específicos
- Processos já atribuídos ao usuário aparecem desabilitados (evita duplicatas)

**Aba "Todos (A–Z)"**
- Lista completa de processos do catálogo em ordem alfabética
- Checkboxes individuais
- Campo de busca no topo (filtra em tempo real)

Botão **"Adicionar (N)"** confirma e adiciona ao fluxo do usuário.

### Operador (visão própria)

- Vê os cards de processo no fluxo (conectados por setas →)
- Cada card exibe: nome do processo, setor de origem, quantidade de mídias
- Clicar no card abre modal de detalhe com as instruções (título, descrição, imagens/vídeos)
- **Não vê** o botão "+ Processo" nem botões de remoção
- Tarefas: **sem mudanças**

---

## Componentes a criar/modificar

| Componente | Ação |
|-----------|------|
| `src/app/(app)/processos/page.tsx` | Criar — server component, busca catálogo |
| `src/features/processes/components/process-catalog-shell.tsx` | Criar — accordion por setor, admin vs viewer |
| `src/features/processes/components/process-detail-modal.tsx` | Criar — visualização de instruções + mídias |
| `src/features/processes/components/process-form-modal.tsx` | Criar — criar/editar processo do catálogo |
| `src/features/processes/components/process-picker-modal.tsx` | Criar — modal de seleção com abas Grupos/Todos |
| `src/features/processes/actions/catalog-actions.ts` | Criar — CRUD do catálogo |
| `src/features/processes/actions/assignment-actions.ts` | Criar — atribuir/remover processos de usuários |
| `src/features/production/components/production-shell.tsx` | Modificar — trocar formulário inline pelo picker |
| `src/config/navigation.ts` | Modificar — adicionar item "Processos" |
| `squados/supabase/migrations/00025_process_catalog.sql` | Criar — migration completa |

---

## Fora de escopo

- Reordenação do fluxo pelo operador (apenas admin reordena)
- Notificações quando catálogo é atualizado
- Histórico de versões de processos
- Processos obrigatórios vs opcionais
