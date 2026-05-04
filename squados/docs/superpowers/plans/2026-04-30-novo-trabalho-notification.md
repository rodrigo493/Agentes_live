# Notificação "Novo Trabalho" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir uma targa preta fixa com glow amarelo e bordas laranjas piscantes — e tocar 3 beeps — em qualquer página do app quando o usuário recebe um novo card no seu fluxo de trabalho.

**Architecture:** Hook `use-work-notification` abre uma assinatura Supabase Realtime em `workflow_inbox_items` (INSERT filtrado por `user_id`). O `AppShell` renderiza `WorkNotificationBanner` quando há notificação na fila. O banner persiste até o usuário clicar "Ver agora", que navega para `/operations/card/[stepId]` e remove o item da fila.

**Tech Stack:** React 18, Next.js App Router, Supabase Realtime (postgres_changes), Web Audio API, Tailwind CSS (posicionamento), CSS-in-JSX para keyframes de animação.

---

## Mapa de arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `src/features/notifications/hooks/use-work-notification.ts` |
| Criar | `src/features/notifications/components/work-notification-banner.tsx` |
| Modificar | `src/shared/components/layout/app-shell.tsx` |

---

## Task 1: Hook `use-work-notification`

**Files:**
- Create: `src/features/notifications/hooks/use-work-notification.ts`

- [ ] **Step 1: Criar o arquivo do hook**

```typescript
'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import type { WorkflowInboxItem } from '@/shared/types/database';

export interface WorkNotification {
  id: string;
  workflow_step_id: string;
  instance_id: string;
  title: string;
  reference: string | null;
}

export function useWorkNotification(userId: string) {
  const [queue, setQueue] = useState<WorkNotification[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    if (!userId || channelRef.current) return;

    const supabase = createClient();

    channelRef.current = supabase
      .channel('work-notification-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workflow_inbox_items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const item = payload.new as WorkflowInboxItem;
          setQueue((prev) => [
            ...prev,
            {
              id: item.id,
              workflow_step_id: item.workflow_step_id,
              instance_id: item.instance_id,
              title: item.title,
              reference: item.reference,
            },
          ]);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);

  const notification: WorkNotification | null = queue.length > 0 ? queue[0] : null;

  function dismiss() {
    setQueue((prev) => prev.slice(1));
  }

  return { notification, dismiss };
}
```

- [ ] **Step 2: Verificar que o arquivo compila sem erros**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep use-work-notification
```
Esperado: nenhuma saída (sem erros).

- [ ] **Step 3: Commit**

```bash
git add src/features/notifications/hooks/use-work-notification.ts
git commit -m "feat(notifications): hook useWorkNotification com Realtime para workflow_inbox_items"
```

---

## Task 2: Banner `WorkNotificationBanner`

**Files:**
- Create: `src/features/notifications/components/work-notification-banner.tsx`

- [ ] **Step 1: Criar o componente com animações e som**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkNotification } from '../hooks/use-work-notification';

function playNewWorkSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const sequence = [880, 1046, 880];
    sequence.forEach((freq, i) => {
      const start = i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start + 0.13);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + 0.15);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.15);
    });
  } catch {
    // silencioso se AudioContext indisponível
  }
}

interface WorkNotificationBannerProps {
  notification: WorkNotification;
  onDismiss: () => void;
}

export function WorkNotificationBanner({ notification, onDismiss }: WorkNotificationBannerProps) {
  const router = useRouter();

  useEffect(() => {
    playNewWorkSound();
  }, [notification.id]);

  function handleVerAgora() {
    router.push(`/operations/card/${notification.workflow_step_id}`);
    onDismiss();
  }

  return (
    <>
      <style>{`
        @keyframes nt-blink-orange {
          0% {
            border-top-color: #ff6b00;
            border-bottom-color: #ff6b00;
            box-shadow:
              0 0 14px 4px rgba(255,220,0,0.40),
              0 0 32px 10px rgba(255,200,0,0.18),
              0 -6px 20px rgba(255,107,0,0.60),
              0  6px 20px rgba(255,107,0,0.60);
          }
          100% {
            border-top-color: rgba(255,107,0,0.12);
            border-bottom-color: rgba(255,107,0,0.12);
            box-shadow:
              0 0 8px 2px rgba(255,220,0,0.12),
              0 0 16px 4px rgba(255,200,0,0.07),
              0 -2px 8px rgba(255,107,0,0.18),
              0  2px 8px rgba(255,107,0,0.18);
          }
        }
        @keyframes nt-flicker {
          0%, 89%, 100% { opacity: 1; }
          91%            { opacity: 0.82; }
          93%            { opacity: 1; }
          95%            { opacity: 0.88; }
        }
        @keyframes nt-pulse-dot {
          0%   { box-shadow: 0 0 4px 1px rgba(255,230,0,0.55); }
          100% { box-shadow: 0 0 12px 4px rgba(255,230,0,0.90); }
        }
        .nt-banner {
          position: fixed;
          top: 56px;
          left: 0;
          right: 0;
          height: 52px;
          background: #0a0a0a;
          border-top: 2px solid #ff6b00;
          border-bottom: 2px solid #ff6b00;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          z-index: 9999;
          animation: nt-blink-orange 0.7s ease-in-out infinite alternate;
        }
        .nt-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: #ffe600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          text-shadow:
            0 0 8px rgba(255,230,0,0.85),
            0 0 22px rgba(255,220,0,0.40);
          animation: nt-flicker 2.5s ease-in-out infinite;
        }
        .nt-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ffe600;
          flex-shrink: 0;
          animation: nt-pulse-dot 0.8s ease-in-out infinite alternate;
        }
        .nt-tag {
          font-size: 0.58rem;
          font-weight: 700;
          color: #ff8c00;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-shadow: 0 0 8px rgba(255,140,0,0.55);
        }
        .nt-ref {
          font-size: 0.68rem;
          color: #555;
          margin-left: 8px;
        }
        .nt-btn {
          background: transparent;
          border: 1px solid #333;
          color: #aaa;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 5px 14px;
          border-radius: 5px;
          cursor: pointer;
          letter-spacing: 0.04em;
          white-space: nowrap;
          transition: border-color 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .nt-btn:hover {
          border-color: #ff8c00;
          color: #ffb300;
        }
      `}</style>

      <div className="nt-banner">
        {/* Esquerda: ícone + textos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div className="nt-dot" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
            <span className="nt-tag">⚡ Operações</span>
            <span className="nt-title">Novo Trabalho</span>
          </div>
          <span
            className="nt-ref"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {notification.title}
            {notification.reference ? ` · ${notification.reference}` : ''}
          </span>
        </div>

        {/* Direita: botão */}
        <button className="nt-btn" onClick={handleVerAgora}>
          Ver agora →
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar que compila sem erros**

```bash
cd squados && npx tsc --noEmit 2>&1 | grep work-notification-banner
```
Esperado: nenhuma saída.

- [ ] **Step 3: Commit**

```bash
git add src/features/notifications/components/work-notification-banner.tsx
git commit -m "feat(notifications): WorkNotificationBanner com glow amarelo, borda laranja piscante e som"
```

---

## Task 3: Integrar no AppShell

**Files:**
- Modify: `src/shared/components/layout/app-shell.tsx`

- [ ] **Step 1: Adicionar imports no topo do arquivo**

No arquivo `src/shared/components/layout/app-shell.tsx`, adicionar logo após os imports existentes:

```typescript
import { useWorkNotification } from '@/features/notifications/hooks/use-work-notification';
import { WorkNotificationBanner } from '@/features/notifications/components/work-notification-banner';
```

- [ ] **Step 2: Chamar o hook e renderizar o banner**

Dentro da função `AppShell`, adicionar o hook logo após a declaração de `mobileOpen`:

```typescript
const { notification, dismiss } = useWorkNotification(profile.id);
```

E no JSX, logo após a tag `<header>` de fechamento (linha após `</header>` do header principal), adicionar:

```tsx
{notification && (
  <WorkNotificationBanner notification={notification} onDismiss={dismiss} />
)}
```

O bloco `return` completo ficará assim:

```tsx
return (
  <div className="flex flex-col min-h-screen bg-background">
    {/* ── Tarja preta superior ── */}
    <header className="sticky top-0 z-50 h-14 bg-black flex items-center justify-center flex-shrink-0 shadow-md">
      <OverdueBeacons />
      <Image
        src="/live-squad.png"
        alt="Live Squad"
        width={220}
        height={40}
        className="h-9 w-auto object-contain"
        priority
      />
      <NewAlertBadges />
    </header>

    {/* ── Banner "Novo Trabalho" — aparece em todas as páginas ── */}
    {notification && (
      <WorkNotificationBanner notification={notification} onDismiss={dismiss} />
    )}

    {/* ── Linha abaixo da tarja: sidebar + conteúdo ── */}
    <div className="flex flex-1 min-h-0">
      {/* Sidebar desktop */}
      <div className="hidden md:flex md:flex-shrink-0 sticky top-14 h-[calc(100vh-56px)]">
        <Sidebar
          userRole={profile.role}
          userName={profile.full_name}
          userSectors={userSectors}
          activeSector={activeSector}
          allowedNavItems={profile.allowed_nav_items ?? null}
          onLogout={() => logoutAction()}
        />
      </div>

      {/* Drawer mobile */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <div className="h-full">
            <Sidebar
              userRole={profile.role}
              userName={profile.full_name}
              userSectors={userSectors}
              activeSector={activeSector}
              allowedNavItems={profile.allowed_nav_items ?? null}
              onLogout={() => logoutAction()}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Conteúdo principal */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex items-center gap-3 px-4 h-12 border-b border-border bg-[hsl(var(--sidebar-background))] sticky top-14 z-20">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-[hsl(var(--sidebar-foreground))] p-1 rounded-md hover:bg-[hsl(var(--sidebar-accent))]"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-[hsl(var(--sidebar-foreground))]">Menu</span>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 3: Verificar typecheck completo**

```bash
cd squados && npx tsc --noEmit 2>&1
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/layout/app-shell.tsx
git commit -m "feat(notifications): integra WorkNotificationBanner no AppShell para todas as páginas"
```

---

## Task 4: Verificação manual

- [ ] **Step 1: Iniciar o servidor de desenvolvimento**

```bash
cd squados && npm run dev
```

- [ ] **Step 2: Abrir o app e logar com um usuário não-admin**

Abrir `http://localhost:3000` e logar com um usuário que tem steps de workflow atribuídos.

- [ ] **Step 3: Simular recebimento de novo card**

Em outra aba (ou como admin), iniciar um novo fluxo de trabalho atribuído ao usuário logado.  
Via SQL direto também funciona para teste rápido:

```sql
INSERT INTO workflow_inbox_items (user_id, workflow_step_id, instance_id, title, reference, received_at, due_at, handoff_target_at, status)
VALUES (
  '<id-do-usuario>',
  '<id-de-um-step-valido>',
  '<id-de-uma-instancia-valida>',
  'Revisão de Qualidade',
  'PA-2026-TEST',
  now(),
  now() + interval '24 hours',
  now() + interval '20 hours',
  'pending'
);
```

- [ ] **Step 4: Verificar comportamento esperado**

✅ Targa preta aparece imediatamente abaixo do header preto  
✅ Texto "NOVO TRABALHO" em amarelo fosforescente piscando suavemente  
✅ Bordas superior e inferior laranjas piscando  
✅ 3 beeps tocam ao aparecer  
✅ Nome do card e referência aparecem ao centro  
✅ Botão "Ver agora →" funciona e navega para a página do card  
✅ Após clicar, targa desaparece  
✅ Targa aparece em qualquer página (testar navegando para /workspace antes de inserir)

- [ ] **Step 5: Testar fila (2 cards simultâneos)**

Inserir 2 rows no SQL acima. Verificar que a segunda targa aparece ao dispensar a primeira.

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "test(notifications): verificação manual da targa novo-trabalho concluída"
```
