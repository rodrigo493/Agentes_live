# Design Spec: Problemas de Produção

**Data:** 2026-05-04  
**Projeto:** SquadOS  
**Branch:** feat/problemas-producao  
**Status:** Aprovado para implementação

---

## Visão Geral

Módulo informativo para o CEO acompanhar problemas de produção recebidos via webhook do CRM Live. Cada problema recebido vira um KPI card. O CEO pode encaminhar problemas para usuários do Squad (com observação opcional), e os usuários designados recebem o mesmo KPI nas suas visões.

---

## Fluxo de Dados

```
CRM Live
  └─► POST /api/problemas-producao/webhook
        └─► INSERT production_problems (descrição, cliente, data/hora, payload)
              └─► CEO abre /problemas-producao
                    └─► Seleciona usuários + escreve observação
                          └─► INSERT problem_assignments (problem_id, user_ids, solution)
                                └─► Usuários designados veem card em "Problemas Encaminhados"
```

---

## Banco de Dados

### Tabela `production_problems`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Gerado automaticamente |
| `description` | text NOT NULL | Descrição do problema recebida do CRM |
| `client_name` | text NOT NULL | Nome do cliente |
| `received_at` | timestamptz NOT NULL | Data/hora enviada pelo CRM |
| `crm_payload` | jsonb | Payload completo do webhook (para auditoria) |
| `created_at` | timestamptz DEFAULT now() | |

### Tabela `problem_assignments`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `problem_id` | uuid FK → production_problems | |
| `assigned_user_id` | uuid FK → users | Usuário designado |
| `assigned_by` | uuid FK → users | CEO que encaminhou |
| `solution` | text | Observação opcional do CEO |
| `assigned_at` | timestamptz DEFAULT now() | |

**RLS:**
- `production_problems`: leitura para todos os usuários autenticados (a filtragem por papel é feita na server action, não no RLS).
- `problem_assignments`: leitura apenas para `assigned_user_id = auth.uid()` OU `role = 'admin'`. Escrita apenas pelo service role (server action usa service role via `supabaseAdmin`).

---

## Webhook

**Endpoint:** `POST /api/problemas-producao/webhook`

**Payload esperado do CRM Live:**
```json
{
  "description": "Equipamento V12 entregue com defeito...",
  "client_name": "Estúdio Forma & Vida",
  "received_at": "2026-05-04T09:14:00Z"
}
```

**Autenticação:** Header `x-webhook-secret` com valor fixo configurado via variável de ambiente `PROBLEMAS_WEBHOOK_SECRET`.

**Resposta de sucesso:** `201 Created` com `{ "id": "<uuid>" }`.

---

## Navegação

Adicionar em `config/navigation.ts`:

```ts
{
  href: '/problemas-producao',
  label: 'Problemas Produção',
  icon: 'AlertTriangle',
  minLevel: 'viewer',
}
```

Badge contador mostra problemas sem nenhuma assignment (status "Novo").

---

## Página do CEO — `/problemas-producao`

### Componentes

- `app/(app)/problemas-producao/page.tsx` — Server component, busca lista de problemas
- `features/problemas-producao/components/problemas-shell.tsx` — Client shell principal
- `features/problemas-producao/components/problem-kpi-card.tsx` — Card individual
- `features/problemas-producao/components/user-assignment-panel.tsx` — Painel de encaminhamento (seletor + nota)
- `features/problemas-producao/actions/problemas-actions.ts` — Server actions

### Estados do Card

| Estado | Cor da borda | Badge |
|--------|-------------|-------|
| Novo (sem assignments) | vermelho (`#ef4444`) | `NOVO` |
| Encaminhando (CEO abriu painel) | âmbar (`#f59e0b`) | `ENCAMINHANDO` |
| Encaminhado (tem assignments) | verde (`#10b981`) | `ENCAMINHADO` |

### Informações exibidas no card (sempre visível)
- Badge de status
- Nome do cliente + data/hora recebido
- Descrição do problema (texto completo)
- Botão "Encaminhar" / "Ver encaminhamento"

### Painel de encaminhamento (expansível, só CEO/admin)
- Multiselect de usuários do Squad (busca por nome, exibe setor)
- Campo de texto livre com label **"Solução do Problema"** para o CEO descrever a ação/solução
- Botão "Confirmar encaminhamento" → chama server action `assignProblem`
- Quando encaminhado: exibe lista de usuários designados + solução do CEO

### Filtros no cabeçalho
- Todos | Pendentes (sem assignment) | Encaminhados

### Exportação
Botão "Exportar" no cabeçalho da página abre um dropdown com duas opções:
- **PDF** — lista dos problemas visíveis (filtro atual aplicado), com colunas: cliente, data/hora, descrição, status, usuários designados, solução do CEO. Gerado client-side via `jsPDF` + `jspdf-autotable`.
- **Excel (.xlsx)** — mesmas colunas, gerado via `xlsx` (SheetJS). Download direto no browser.

Ambos exportam apenas os problemas visíveis para o usuário no momento (respeitando filtro ativo).

---

## Visão do Usuário Designado

Usuários que receberam um encaminhamento veem uma seção **"Problemas Encaminhados para Mim"** no seu dashboard (`/dashboard`) ou na página `/problemas-producao` com visão filtrada.

Cada card exibe:
- Descrição do problema
- Nome do cliente + data/hora
- Observação do CEO (destacada em âmbar)
- (read-only — usuário não tem ações aqui nesta versão)

**Acesso à página `/problemas-producao`:** todos os usuários acessam, mas:
- `role = 'admin'` (CEO): vê todos os problemas + painel de encaminhamento visível
- Outros roles: a server action `getProblems()` retorna apenas os problemas onde `problem_assignments.assigned_user_id = user.id`; painel de encaminhamento oculto

---

## Server Actions

```ts
// features/problemas-producao/actions/problemas-actions.ts

getProblems()           // Busca todos os problemas (CEO) ou apenas encaminhados (outros)
assignProblem(problemId, userIds, ceoNote)  // Cria problem_assignments
getSquadUsers()         // Lista usuários para o seletor
```

---

## Fora de Escopo (v1)

- Usuários não têm ação de "resolver" ou "dar baixa" no problema
- Notificações push/realtime para usuários designados (v2 — integrar WorkNotificationBanner)
- Filtros avançados por data/cliente na exportação
- Histórico de edições da solução do CEO

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/00067_production_problems.sql` | CRIAR |
| `app/api/problemas-producao/webhook/route.ts` | CRIAR |
| `app/(app)/problemas-producao/page.tsx` | CRIAR |
| `features/problemas-producao/components/problemas-shell.tsx` | CRIAR |
| `features/problemas-producao/components/problem-kpi-card.tsx` | CRIAR |
| `features/problemas-producao/components/user-assignment-panel.tsx` | CRIAR |
| `features/problemas-producao/actions/problemas-actions.ts` | CRIAR |
| `features/problemas-producao/components/export-button.tsx` | CRIAR |
| `config/navigation.ts` | MODIFICAR — adicionar aba |
