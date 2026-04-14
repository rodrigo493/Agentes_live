# PWA + Layout Mobile SquadOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o SquadOS em PWA instalável no celular (Android/iOS) com layout responsivo — sidebar vira menu hamburguer no mobile, telas adaptadas para telas pequenas.

**Architecture:** Fase 1 adiciona manifest.json + meta tags iOS + caching no SW (zero mudança de código de app). Fase 2 transforma o AppShell em layout dual: sidebar fixa no desktop, Sheet drawer no mobile acionado por botão hamburguer no header.

**Tech Stack:** Next.js App Router, Tailwind CSS, shadcn/ui Sheet component, Service Worker Cache API.

---

## Arquivos que serão criados/modificados

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `squados/public/manifest.json` | Criar | Manifesto PWA (nome, ícones, cores, display) |
| `squados/public/icon-192.png` | Criar | Ícone PWA 192×192 (copiar squados-icon.png) |
| `squados/public/icon-512.png` | Criar | Ícone PWA 512×512 (copiar squados-icon.png) |
| `squados/public/sw.js` | Modificar | Adicionar caching de assets estáticos |
| `squados/src/app/layout.tsx` | Modificar | Link manifest + meta tags iOS/PWA |
| `squados/src/shared/components/layout/app-shell.tsx` | Modificar | Header mobile com botão hamburguer, Sheet drawer |
| `squados/src/shared/components/layout/sidebar.tsx` | Modificar | Aceitar prop `onClose` para fechar drawer mobile |

---

## Fase 1 — PWA (manifest + ícones + SW caching)

### Task 1: Criar manifest.json

**Files:**
- Criar: `squados/public/manifest.json`

- [ ] **Step 1: Criar o arquivo manifest.json**

```json
{
  "name": "SquadOS",
  "short_name": "SquadOS",
  "description": "Sistema Operacional Corporativo",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0f172a",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 2: Copiar squados-icon.png como icon-192.png e icon-512.png**

```bash
cp squados/public/squados-icon.png squados/public/icon-192.png
cp squados/public/squados-icon.png squados/public/icon-512.png
```

> Nota: ícones são a mesma imagem por ora. Se quiser qualidade ideal no futuro, usar imagens 192px e 512px reais.

- [ ] **Step 3: Verificar que os 3 arquivos existem**

```bash
ls squados/public/manifest.json squados/public/icon-192.png squados/public/icon-512.png
```

---

### Task 2: Adicionar manifest e meta tags no layout raiz

**Files:**
- Modificar: `squados/src/app/layout.tsx`

- [ ] **Step 1: Atualizar layout.tsx com manifest link e meta tags iOS**

Substituir o conteúdo de `squados/src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "SquadOS — Sistema Operacional Corporativo",
  description: "Plataforma de comunicação, conhecimento e inteligência para sua empresa",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SquadOS",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verificar build sem erros**

```bash
cd squados && npm run build 2>&1 | tail -20
```

Esperado: `✓ Compiled successfully` sem erros de TypeScript.

---

### Task 3: Adicionar caching no Service Worker

**Files:**
- Modificar: `squados/public/sw.js`

- [ ] **Step 1: Atualizar sw.js com cache de assets estáticos**

Substituir o conteúdo de `squados/public/sw.js`:

```javascript
const CACHE_NAME = 'squados-v1';
const STATIC_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/squados-icon.png',
];

// Instala o SW e faz cache dos assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Ativa e limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fallback para cache (só para assets estáticos)
self.addEventListener('fetch', (event) => {
  if (STATIC_ASSETS.some((asset) => event.request.url.endsWith(asset))) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});

// Clique em notificação — foca/abre a aba correta
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data?.url || '/workspace';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: Commit Fase 1**

```bash
cd /repositório-raiz
git add squados/public/manifest.json squados/public/icon-192.png squados/public/icon-512.png squados/src/app/layout.tsx squados/public/sw.js
git commit -m "feat(pwa): manifest, ícones, meta tags iOS e caching no SW"
git push origin main
```

- [ ] **Step 3: Deploy na VPS e testar instalação**

```bash
# Na VPS Livetech:
cd /tmp/Agentes_live && git pull origin main
cd squados && docker build --no-cache -t s3:latest .
docker service update --image s3:latest --force squad_squad
```

Verificação no Chrome mobile (Android):
1. Abrir `https://squad.liveuni.com.br` no Chrome
2. Menu (3 pontos) → "Adicionar à tela inicial" deve aparecer
3. Adicionar e abrir — deve abrir sem barra de endereço

Verificação no iOS Safari:
1. Abrir no Safari
2. Botão compartilhar → "Adicionar à Tela de Início"
3. Abrir — deve abrir em tela cheia

---

## Fase 2 — Layout Mobile Responsivo

### Task 4: Tornar Sidebar responsiva (drawer no mobile)

**Files:**
- Modificar: `squados/src/shared/components/layout/sidebar.tsx`
- Modificar: `squados/src/shared/components/layout/app-shell.tsx`

- [ ] **Step 1: Verificar que Sheet está disponível no shadcn**

```bash
ls squados/src/components/ui/sheet.tsx 2>/dev/null && echo "OK" || echo "FALTANDO"
```

Se `FALTANDO`, instalar:
```bash
cd squados && npx shadcn@latest add sheet
```

- [ ] **Step 2: Atualizar sidebar.tsx para aceitar prop onClose**

Adicionar `onClose?: () => void` na interface `SidebarProps` e chamar `onClose()` ao clicar em qualquer link de navegação:

Substituir a interface e o componente em `squados/src/shared/components/layout/sidebar.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useDesktopNotifications } from '@/features/notifications/hooks/use-desktop-notifications';
import type { UserRole } from '@/shared/types/database';
import { getNavItemsForRole } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { SectorSwitcher } from '@/features/auth/components/sector-switcher';

interface SidebarProps {
  userRole: UserRole;
  userName: string;
  userSectors: { id: string; name: string; icon: string | null }[];
  activeSector: { id: string; name: string; icon: string | null } | null;
  onLogout: () => void;
  onClose?: () => void; // fecha o drawer no mobile
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function Sidebar({ userRole, userName, userSectors, activeSector, onLogout, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const navItems = getNavItemsForRole(userRole);
  const { requestPermission } = useDesktopNotifications();
  const [permission, setPermission] = useState<string>('unsupported');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const handleEnableNotifications = async () => {
    const result = await requestPermission();
    setPermission(result);
  };

  return (
    <aside
      className={cn(
        'flex flex-col bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] border-r border-[hsl(var(--sidebar-border))] transition-all duration-300 h-full',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[hsl(var(--sidebar-border))]">
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--sidebar-primary))] flex items-center justify-center flex-shrink-0">
          <span className="text-[hsl(var(--sidebar-primary-foreground))] font-bold text-sm">S</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-base font-bold text-[hsl(var(--sidebar-primary-foreground))] truncate">Squad</h1>
            <p className="text-[10px] text-[hsl(var(--sidebar-muted))] truncate">LiveUni Platform</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-md'
                  : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

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

        {userSectors.length >= 2 && (
          <SectorSwitcher
            sectors={userSectors}
            activeSector={activeSector}
            collapsed={collapsed}
          />
        )}

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

        {/* Botão colapsar — só no desktop */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex w-full items-center justify-center p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))]"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Atualizar app-shell.tsx com header mobile + Sheet drawer**

Substituir o conteúdo de `squados/src/shared/components/layout/app-shell.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';
import type { Profile } from '@/shared/types/database';
import { logoutAction } from '@/features/auth/actions/auth-actions';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface AppShellProps {
  profile: Profile;
  userSectors: Sector[];
  activeSector: Sector | null;
  children: React.ReactNode;
}

export function AppShell({ profile, userSectors, activeSector, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop — esconde no mobile */}
      <div className="hidden md:flex md:flex-shrink-0 sticky top-0 h-screen">
        <Sidebar
          userRole={profile.role}
          userName={profile.full_name}
          userSectors={userSectors}
          activeSector={activeSector}
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
              onLogout={() => logoutAction()}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Conteúdo principal */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header mobile com hamburguer */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-[hsl(var(--sidebar-background))] sticky top-0 z-20">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-[hsl(var(--sidebar-foreground))] p-1 rounded-md hover:bg-[hsl(var(--sidebar-accent))]"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[hsl(var(--sidebar-primary))] flex items-center justify-center">
              <span className="text-[hsl(var(--sidebar-primary-foreground))] font-bold text-xs">S</span>
            </div>
            <span className="font-semibold text-sm text-[hsl(var(--sidebar-primary-foreground))]">SquadOS</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar build**

```bash
cd squados && npm run build 2>&1 | tail -20
```

Esperado: sem erros TypeScript.

---

### Task 5: Commit e deploy final

- [ ] **Step 1: Commit Fase 2**

```bash
cd /repositório-raiz
git add squados/src/shared/components/layout/app-shell.tsx squados/src/shared/components/layout/sidebar.tsx
git commit -m "feat(mobile): sidebar vira drawer no mobile com header hamburguer"
git push origin main
```

- [ ] **Step 2: Deploy na VPS**

```bash
# Na VPS Livetech:
cd /tmp/Agentes_live && git pull origin main
cd squados && docker build --no-cache -t s3:latest .
docker service update --image s3:latest --force squad_squad
```

- [ ] **Step 3: Teste no celular**

Android Chrome:
1. Abrir `https://squad.liveuni.com.br`
2. Menu → "Adicionar à tela inicial" → instalar
3. Abrir app → deve mostrar header com hamburguer
4. Clicar hamburguer → drawer abre com navegação
5. Clicar item → drawer fecha + página carrega

iOS Safari:
1. Abrir `https://squad.liveuni.com.br`
2. Compartilhar → "Adicionar à Tela de Início" → instalar
3. Abrir → tela cheia, header com hamburguer funciona

---

## Notas de implementação

- `h-screen sticky top-0` na sidebar desktop foi substituído por `sticky top-0 h-screen` no wrapper
- O botão de colapsar sidebar fica oculto no mobile (`hidden md:flex`) — no mobile só existe o drawer
- `SheetTitle` com `sr-only` é necessário para acessibilidade (shadcn exige título no Sheet)
- Se `sheet.tsx` não existir, instalar com `npx shadcn@latest add sheet` antes do Task 4
