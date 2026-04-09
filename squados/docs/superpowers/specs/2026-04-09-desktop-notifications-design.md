# Design: Notificações Desktop — SquadOS

**Data:** 2026-04-09
**Status:** Aprovado
**Escopo:** Browser Notification API (aba aberta, browser em background)

---

## Objetivo

Exibir notificações nativas do sistema operacional quando o usuário receber uma mensagem no workspace ou uma nova tarefa for atribuída a ele, mesmo com a aba do SquadOS em segundo plano ou a janela minimizada.

---

## Fora do escopo

- Notificações com browser fechado (Service Worker + Web Push) — fase futura
- Alertas do Maestro — fase futura
- Som nas notificações — fase futura

---

## Arquitetura

### Novo arquivo

```
src/features/notifications/hooks/use-desktop-notifications.ts
```

Hook centralizado que gerencia permissão e disparo de notificações.

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/features/workspace/hooks/use-realtime-messages.ts` | Chama `notify()` em novas mensagens |
| `src/shared/components/AppShell` ou Header/Sidebar | Botão "Ativar notificações" |
| Hook de tarefas (a identificar) | Chama `notify()` em tarefas atribuídas |

---

## Hook: `useDesktopNotifications`

### Interface

```typescript
const { notify, permissionState, requestPermission } = useDesktopNotifications()
```

### `notify(title, body, url)`

1. Verifica `Notification.permission === 'granted'`
2. Verifica `document.visibilityState !== 'visible'`
3. Cria `new Notification(title, { body, icon: '/logo.svg' })`
4. No click: `window.focus()` + `router.push(url)`
5. Auto-fecha após 5 segundos via `notification.close()`

### Gestão de permissão

- Browsers bloqueiam `requestPermission()` sem gesto explícito do usuário
- Botão **"Ativar notificações"** exibido no header/sidebar enquanto `permissionState === 'default'`
- Ao clicar: chama `Notification.requestPermission()`
- Se `granted`: botão some, notificações ativas
- Se `denied`: mostra mensagem orientando habilitar nas configurações do browser

---

## Eventos que disparam notificações

### Mensagens do workspace

- **Hook:** `useRealtimeMessages`
- **Condição:** nova mensagem recebida via Supabase Realtime
- **Filtro:** não notificar se `message.sender_id === currentUser.id`
- **Filtro:** não notificar se `document.visibilityState === 'visible'`
- **Título:** `"💬 {nomeRemetente}"`
- **Corpo:** preview da mensagem (máx 60 chars, truncado com `…`)
- **URL destino:** `/workspace/{conversationId}`

### Tarefas atribuídas

- **Hook:** hook de tarefas (localização a confirmar na implementação)
- **Condição:** nova tarefa com `assignee_id === currentUser.id`
- **Filtro:** não notificar se `document.visibilityState === 'visible'`
- **Título:** `"📋 Nova tarefa atribuída"`
- **Corpo:** título da tarefa (máx 60 chars)
- **URL destino:** `/tasks/{taskId}` (rota a confirmar)

---

## Fluxo completo

```
Supabase Realtime (postgres_changes INSERT)
        ↓
useRealtimeMessages / tasks hook
        ↓
notify(título, corpo, url)
        ↓
Notification.permission === 'granted'?  →  NÃO → silencioso
        ↓ SIM
document.visibilityState !== 'visible'? →  NÃO → silencioso
        ↓ SIM
new Notification(título, { body, icon })
        ↓
Usuário clica → window.focus() + router.push(url)
```

---

## Compatibilidade

A Notification API é suportada em todos os browsers modernos (Chrome, Firefox, Edge, Safari 16.4+). Em contextos sem suporte (`!('Notification' in window)`), o hook retorna `permissionState = 'unsupported'` e `notify()` é no-op.

---

## O que NÃO muda

- Infraestrutura Supabase Realtime existente — sem alterações
- Sonner toasts existentes — continuam funcionando em paralelo
- Lógica de mensagens — sem refatoração de lógica de negócio
