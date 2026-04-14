# SquadOS — Roadmap Design (4 Fases)

**Data:** 2026-04-13  
**Projeto:** SquadOS  
**Ordem:** Linear por prioridade (A → D)  
**Stack:** Next.js 15 App Router, Supabase, Tailwind, shadcn/ui, TypeScript

---

## Fase 1 — Produção

### 1.1 Realtime na Caixa de Entrada

Trocar o polling de 30s por `supabase.channel()` inscrito na tabela `workflow_inbox_items` com filtro por `user_id`.

- Componente: `src/features/workflows/components/workflow-inbox.tsx`
- Escuta eventos `INSERT` e `UPDATE` via Supabase Realtime
- Atualiza estado local sem reload de página
- Sem novas migrations

### 1.2 Web Push para o Presidente

**3 partes:**

**Service Worker** (`/public/sw.js`)
- Recebe eventos `push` do browser
- Exibe notificação nativa com título, corpo e ícone do SquadOS
- Ao clicar, abre a rota `/producao`

**Subscription (frontend)**
- Botão "Ativar notificações" no perfil ou nas configurações
- Browser gera `PushSubscription` (endpoint + keys)
- Salvo na nova tabela `push_subscriptions`

**Disparo (backend)**
- Na server action que cria uma advertência, após salvar
- Busca subscriptions de usuários com `role IN ('admin', 'master_admin')`
- Envia via Web Push API usando lib `web-push`
- Payload: nome do colaborador + texto da advertência

**Nova migration:** `push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)` com RLS (usuário só vê as próprias).

### 1.3 Mensagem no chat do orquestrador

- Na mesma server action de advertência, após salvar
- Insere mensagem em `chat_messages` no canal do agente `orquestrador`
- Texto: `"[ADVERTÊNCIA] {nome_colaborador}: {motivo}"`
- Usa padrão existente de inserção de mensagens

---

## Fase 2 — Roteiros

### 2.1 Agente orquestrador

- Migration com `INSERT INTO agents (slug, name, ...) ... ON CONFLICT (slug) DO NOTHING`
- Garante existência sem duplicar
- O trigger de workflow já referencia `slug = 'orquestrador'` — nenhuma mudança de código

### 2.2 Pipeline RAG para procedures

**Verificação:**
```sql
SELECT id, title, embedding IS NOT NULL as has_embedding
FROM knowledge_docs
WHERE doc_type = 'procedure'
LIMIT 10;
```

**Cenário A — já cobre:** confirmar via query, nenhuma mudança.

**Cenário B — não cobre:** criar Edge Function `embed-procedures` que:
- Busca `knowledge_docs` onde `doc_type = 'procedure'` e `embedding IS NULL`
- Chama API de embeddings (mesmo padrão dos outros doc_types)
- Atualiza o registro com o embedding gerado
- Roda manualmente uma vez + fica ativo para novos roteiros via trigger existente

---

## Fase 3 — Voz

### 3.1 Fallback Whisper

- Arquivo: `src/app/api/stt/route.ts`
- Fluxo atual: áudio → ElevenLabs Scribe → texto
- Novo fluxo: áudio → ElevenLabs Scribe → se vazio/erro/< 3 chars → OpenAI Whisper `whisper-1` → texto
- Nova variável de ambiente: `OPENAI_API_KEY`
- Sem migrations

### 3.2 Deploy e testes mobile

- Deploy do fix `5f67d42` na VPS (git pull + rebuild)
- Confirmar envs `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` no service Docker `squad_squad`
- Testar manualmente: Safari iOS (audio/mp4) e Chrome Android (audio/webm)

---

## Fase 4 — Workflows

### 4.1 Export CSV

- Botão "Exportar CSV" em `overdue-dashboard.tsx` e `block-analytics.tsx`
- Gera CSV client-side com dados já carregados (sem nova query)
- Download via `Blob` + `URL.createObjectURL`
- Sem migrations

### 4.2 Gráfico temporal de atrasos

- Nova seção em `workflow-shell.tsx` ou aba no analytics
- Gráfico de linha: quantidade de etapas em atraso por semana
- Dados: `workflow_instances` + `workflow_steps` agrupados por semana
- Biblioteca: `recharts`
- Sem migrations

### 4.3 Reatribuição com auditoria

- Novo botão "Reatribuir" na etapa em andamento (detalhe da instância)
- Modal com seleção de usuário do mesmo setor
- Ao confirmar:
  - Atualiza `assigned_to` na etapa
  - Insere em `step_reassignments`
  - Histórico visível no detalhe da etapa
- **Nova migration:** `step_reassignments (id, step_id, from_user_id, to_user_id, reassigned_at, reassigned_by)`

### 4.4 Comentários da etapa

- Campo de texto + lista de comentários no detalhe da etapa
- Visível e editável apenas pelo responsável atual (`assigned_to = current_user`)
- **Nova migration:** `step_comments (id, step_id, user_id, body, created_at)`

### 4.5 Cards visuais melhorados

- Arquivo: `src/features/workflows/components/template-editor-modal.tsx`
- Cards de etapa ganham: ícone de tipo, badge de responsável, indicador de prazo
- Sem mudança de estrutura de dados

---

## Migrations resumidas

| Migration | Fase | Tabela |
|-----------|------|--------|
| `00032_push_subscriptions.sql` | 1 | `push_subscriptions` |
| `00033_orquestrador_agent.sql` | 2 | insert em `agents` |
| `00034_step_reassignments.sql` | 4 | `step_reassignments` |
| `00035_step_comments.sql` | 4 | `step_comments` |

---

## Variáveis de ambiente necessárias

| Variável | Fase | Obrigatória |
|----------|------|-------------|
| `VAPID_PUBLIC_KEY` | 1 | Sim (Web Push) |
| `VAPID_PRIVATE_KEY` | 1 | Sim (Web Push) |
| `VAPID_EMAIL` | 1 | Sim (Web Push) |
| `OPENAI_API_KEY` | 3 | Sim (Whisper fallback) |
| `ELEVENLABS_API_KEY` | 3 | Já deve existir |
| `ELEVENLABS_VOICE_ID` | 3 | Já deve existir |

---

## Ordem de execução recomendada

```
Fase 1: Produção
  1.1 → Realtime inbox (sem migration, deploy imediato)
  1.2 → Web Push (migration + service worker + lib web-push)
  1.3 → Chat orquestrador (depende do orquestrador existir → fazer após Fase 2.1)

Fase 2: Roteiros
  2.1 → Migration orquestrador (desbloqueia 1.3)
  2.2 → Validar/criar pipeline RAG

Fase 3: Voz
  3.1 → Fallback Whisper
  3.2 → Deploy VPS + testes

Fase 4: Workflows
  4.1 → Export CSV (mais simples, sem migration)
  4.2 → Gráfico temporal
  4.3 → Reatribuição
  4.4 → Comentários
  4.5 → Cards visuais
```
