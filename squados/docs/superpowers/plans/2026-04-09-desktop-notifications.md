# Desktop Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir notificações nativas do OS quando o usuário receber uma mensagem no workspace, enquanto a aba está em segundo plano.

**Architecture:** Um hook centralizado `useDesktopNotifications` gerencia permissão e disparo. Ele é usado no `Sidebar` (botão de ativar) e no `WorkspaceShell` (disparo ao receber mensagem). Sem Service Worker — funciona apenas com o browser aberto.

**Tech Stack:** Browser Notification API, Next.js App Router (`useRouter`), React hooks, Lucide icons

---

## File Map

| Ação | Arquivo |
|---|---|
| CREATE | `src/features/notifications/hooks/use-desktop-notifications.ts` |
| MODIFY | `src/shared/components/layout/sidebar.tsx` |
| MODIFY | `src/features/workspace/components/workspace-shell.tsx` |

---

### Task 1: Criar o hook `useDesktopNotifications`

**Files:**
- Create: `src/features/notifications/hooks/use-desktop-notifications.ts`

- [ ] **Step 1: Criar o arquivo do hook**

```typescript
// src/features/notifications/hooks/use-desktop-notifications.ts
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

type PermissionState = NotificationPermission | 'unsupported';

export function useDesktopNotifications() {
  const router = useRouter();

  const isSupported =
    typeof window !== 'undefined' && 'Notification' in window;

  const permissionState: PermissionState = isSupported
    ? Notification.permission
    : 'unsupported';

  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (!isSupported) return 'unsupported';
    const result = await Notification.requestPermission();
    return result;
  }, [isSupported]);

  const notify = useCallback(
    (title: string, body: string, url: string) => {
      if (!isSupported || Notification.permission !== 'granted') return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

      const truncated = body.length > 60 ? body.slice(0, 60) + '…' : body;

      const notification = new Notification(title, {
        body: truncated,
        icon: '/globe.svg',
      });

      notification.onclick = () => {
        window.focus();
        router.push(url);
        notification.close();
      };

      setTimeout(() => notification.close(), 5000);
    },
    [isSupported, router]
  );

  return { notify, permissionState, requestPermission };
}
```

- [ ] **Step 2: Verificar que o arquivo foi criado**

```bash
cat src/features/notifications/hooks/use-desktop-notifications.ts
```

Esperado: conteúdo do hook exibido sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/notifications/hooks/use-desktop-notifications.ts
git commit -m "feat: add useDesktopNotifications hook"
```

---

### Task 2: Botão "Ativar notificações" no Sidebar

**Files:**
- Modify: `src/shared/components/layout/sidebar.tsx`

O botão aparece quando `permission === 'default'`, some quando `'granted'` ou `'denied'`.

- [ ] **Step 1: Adicionar imports no topo do sidebar.tsx**

Localizar as linhas atuais de imports (linhas 1-9) e substituir por:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import type { UserRole } from '@/shared/types/database';
import { getNavItemsForRole } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { useDesktopNotifications } from '@/features/notifications/hooks/use-desktop-notifications';
```

- [ ] **Step 2: Adicionar estado de permissão dentro do componente `Sidebar`**

Logo após a linha `const navItems = getNavItemsForRole(userRole);` (linha ~29), adicionar:

```typescript
  const { requestPermission } = useDesktopNotifications();
  const [permission, setPermission] = useState<string>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  });

  const handleEnableNotifications = async () => {
    const result = await requestPermission();
    setPermission(result);
  };
```

- [ ] **Step 3: Adicionar botão de notificação na seção inferior do Sidebar**

Localizar o bloco `{/* User + collapse */}` e adicionar o botão de notificação **antes** do botão de collapse existente. O bloco `p-3 space-y-2` deve ficar assim:

```tsx
      {/* User + collapse */}
      <div className="border-t border-[hsl(var(--sidebar-border))] p-3 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[hsl(var(--sidebar-accent))] flex items-center justify-center">
              <span className="text-xs font-semibold text-[hsl(var(--sidebar-accent-foreground))]">
                {getInitials(userName)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-[10px] text-[hsl(var(--sidebar-muted))] truncate capitalize">
                {userRole.replace('_', ' ')}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))] transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Notification permission button */}
        {permission === 'default' && !collapsed && (
          <button
            onClick={handleEnableNotifications}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))] text-xs"
            title="Ativar notificações"
          >
            <Bell className="w-4 h-4 flex-shrink-0" />
            <span>Ativar notificações</span>
          </button>
        )}
        {permission === 'default' && collapsed && (
          <button
            onClick={handleEnableNotifications}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))]"
            title="Ativar notificações"
          >
            <Bell className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))]"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
```

- [ ] **Step 4: Verificar build sem erros TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/layout/sidebar.tsx
git commit -m "feat: add notification permission button to sidebar"
```

---

### Task 3: Disparar notificação ao receber mensagem no WorkspaceShell

**Files:**
- Modify: `src/features/workspace/components/workspace-shell.tsx`

- [ ] **Step 1: Adicionar import do hook no workspace-shell.tsx**

Após a linha `import { Search, Send, ... } from 'lucide-react';` (linha ~27), adicionar:

```typescript
import { useDesktopNotifications } from '@/features/notifications/hooks/use-desktop-notifications';
```

- [ ] **Step 2: Instanciar o hook dentro do componente `WorkspaceShell`**

Logo após a linha `const scrollRef = useRef<HTMLDivElement>(null);` (linha ~112), adicionar:

```typescript
  const { notify } = useDesktopNotifications();
```

- [ ] **Step 3: Adicionar chamada notify dentro da subscrição realtime**

Localizar o callback do `postgres_changes` INSERT (por volta da linha 137). Após o `setMessages(...)` (que termina com o `return [...]`), adicionar a chamada de notificação:

```typescript
        async (payload) => {
          const msg = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            const contact = contacts.find((c) => c.id === msg.sender_id);
            return [
              ...prev,
              {
                ...msg,
                sender: contact
                  ? { id: contact.id, full_name: contact.full_name, avatar_url: contact.avatar_url }
                  : msg.sender_id === currentUserId
                    ? { id: currentUserId, full_name: currentUserName, avatar_url: null }
                    : null,
              },
            ];
          });

          // Notificação desktop para mensagens de outros usuários
          if (msg.sender_id !== currentUserId) {
            const contact = contacts.find((c) => c.id === msg.sender_id);
            const senderName = contact?.full_name ?? 'Alguém';
            notify(`💬 ${senderName}`, msg.content, '/workspace');
          }
        }
```

- [ ] **Step 4: Verificar build**

```bash
npx tsc --noEmit
```

Esperado: sem erros TypeScript.

- [ ] **Step 5: Commit**

```bash
git add src/features/workspace/components/workspace-shell.tsx
git commit -m "feat: trigger desktop notification on new workspace message"
```

---

### Task 4: Teste manual

- [ ] **Step 1: Subir o servidor de desenvolvimento**

```bash
npm run dev
```

- [ ] **Step 2: Testar permissão**

1. Abrir `http://localhost:3000`
2. Fazer login
3. Verificar que o botão "Ativar notificações" aparece na sidebar (ícone de sino)
4. Clicar no botão → browser exibe popup de permissão
5. Aceitar → botão some da sidebar

- [ ] **Step 3: Testar notificação**

1. Abrir SquadOS em duas abas/janelas com usuários diferentes
2. Minimizar ou trocar para outra aba na janela do usuário A
3. Na janela do usuário B, enviar uma mensagem no workspace para o usuário A
4. Verificar que aparece notificação nativa no SO na janela do usuário A
5. Clicar na notificação → janela A ganha foco e navega para `/workspace`

- [ ] **Step 4: Commit final (se build limpo)**

```bash
npx tsc --noEmit && npm run lint
git add -A
git commit -m "feat: desktop notifications for workspace messages"
```

---

## Notas

- **Tarefas:** não há feature de tarefas ainda. Quando for criada, chamar `notify('📋 Nova tarefa', taskTitle, '/tasks/id')` no hook de tarefas realtime.
- **`document.visibilityState`:** se a aba estiver visível, a notificação não dispara (comportamento intencional).
- **Permissão negada:** se o usuário negar, o botão some e `notify()` silencia automaticamente. Não há UI de recuperação — o usuário deve habilitar manualmente nas configurações do browser.
