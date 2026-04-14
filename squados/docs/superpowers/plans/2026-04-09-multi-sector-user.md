# Multi-Setor por Usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que usuários sejam atribuídos a múltiplos setores (só admin/master_admin) e escolham em qual trabalhar ao fazer login, com troca de setor a qualquer momento via sidebar.

**Architecture:** Nova tabela `user_sectors` armazena setores permitidos por usuário. Coluna `active_sector_id` em `profiles` persiste o setor em uso — é o que o agente de IA lê para contexto. O `loginAction` redireciona para `/select-sector` quando o usuário tem 2+ setores. Um `SectorSwitcher` na sidebar permite troca a qualquer momento sem logout. Admin gerencia setores via checkboxes na criação/edição de usuários.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), server actions, Tailwind CSS

---

## File Map

**Novos arquivos:**
- `squados/supabase/migrations/00018_create_user_sectors.sql`
- `squados/src/app/(auth)/select-sector/page.tsx`
- `squados/src/features/auth/components/select-sector-form.tsx`
- `squados/src/features/auth/components/sector-switcher.tsx`
- `squados/src/features/users/components/sector-checkbox-list.tsx`

**Arquivos modificados:**
- `squados/src/features/auth/actions/auth-actions.ts` — adiciona `selectSectorAction`, modifica redirect do login
- `squados/src/features/users/actions/user-actions.ts` — adiciona `getUserSectorsAction`, `updateUserSectorsAction`
- `squados/src/app/(app)/layout.tsx` — busca setores do usuário, redireciona para /select-sector se necessário
- `squados/src/shared/components/layout/app-shell.tsx` — repassa props de setor para Sidebar
- `squados/src/shared/components/layout/sidebar.tsx` — exibe SectorSwitcher no bloco do usuário
- `squados/src/features/users/components/user-management.tsx` — substitui select de setor por SectorCheckboxList
- `squados/src/app/(app)/dashboard/page.tsx` — usa `active_sector_id` em vez de `sector_id`

---

## Task 1: Migration SQL — user_sectors + active_sector_id

**Files:**
- Create: `squados/supabase/migrations/00018_create_user_sectors.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- supabase/migrations/00018_create_user_sectors.sql

-- Tabela de junção: setores permitidos por usuário
CREATE TABLE user_sectors (
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sector_id   UUID NOT NULL REFERENCES sectors(id)  ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES profiles(id),
  PRIMARY KEY (user_id, sector_id)
);

CREATE INDEX idx_user_sectors_user ON user_sectors(user_id);

ALTER TABLE user_sectors ENABLE ROW LEVEL SECURITY;

-- Usuário lê seus próprios setores; admins leem qualquer um
CREATE POLICY user_sectors_select ON user_sectors FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

-- Somente admin+ pode atribuir setores
CREATE POLICY user_sectors_insert ON user_sectors FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

-- Somente admin+ pode remover setores
CREATE POLICY user_sectors_delete ON user_sectors FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'master_admin')
  )
);

-- Nova coluna em profiles para o setor ativo agora
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_sector_id UUID REFERENCES sectors(id);

-- Migrar sector_id existente para user_sectors
INSERT INTO user_sectors (user_id, sector_id)
SELECT id, sector_id
FROM profiles
WHERE sector_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Preencher active_sector_id com sector_id existente
UPDATE profiles
SET active_sector_id = sector_id
WHERE sector_id IS NOT NULL AND active_sector_id IS NULL;
```

- [ ] **Step 2: Aplicar no Supabase de produção**

Abra o SQL Editor no Supabase Dashboard e execute o arquivo acima.
Verifique: tabela `user_sectors` criada, coluna `active_sector_id` em `profiles`.

- [ ] **Step 3: Commit**

```bash
git add squados/supabase/migrations/00018_create_user_sectors.sql
git commit -m "feat: create user_sectors table and active_sector_id in profiles"
```

---

## Task 2: Server actions — selectSector, getUserSectors, updateUserSectors

**Files:**
- Modify: `squados/src/features/auth/actions/auth-actions.ts`
- Modify: `squados/src/features/users/actions/user-actions.ts`

- [ ] **Step 1: Adicionar `selectSectorAction` em `auth-actions.ts`**

Adicione ao final do arquivo (após `resetPasswordAction`):

```ts
export async function selectSectorAction(sectorId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Não autenticado' };

  const admin = createAdminClient();

  // Verifica que o usuário realmente tem acesso a este setor
  const { data: userSector } = await admin
    .from('user_sectors')
    .select('sector_id')
    .eq('user_id', user.id)
    .eq('sector_id', sectorId)
    .single();

  if (!userSector) return { error: 'Setor não disponível para este usuário' };

  const { error } = await admin
    .from('profiles')
    .update({ active_sector_id: sectorId })
    .eq('id', user.id);

  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  return { success: true };
}
```

Adicione `revalidatePath` ao import existente:
```ts
import { revalidatePath } from 'next/cache';
```

- [ ] **Step 2: Adicionar `getUserSectorsAction` e `updateUserSectorsAction` em `user-actions.ts`**

Adicione ao final do arquivo:

```ts
export async function getUserSectorsAction(userId: string) {
  await requirePermission('users', 'read');

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('user_sectors')
    .select('sector_id, sectors(id, name, icon)')
    .eq('user_id', userId);

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function updateUserSectorsAction(userId: string, sectorIds: string[]) {
  const { user, profile } = await requirePermission('users', 'manage');

  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    return { error: 'Sem permissão para gerenciar setores' };
  }

  const adminClient = createAdminClient();

  // Busca setores atuais
  const { data: current } = await adminClient
    .from('user_sectors')
    .select('sector_id')
    .eq('user_id', userId);

  const currentIds = (current ?? []).map((r) => r.sector_id);
  const toAdd = sectorIds.filter((id) => !currentIds.includes(id));
  const toRemove = currentIds.filter((id) => !sectorIds.includes(id));

  // Remove desmarcados
  if (toRemove.length > 0) {
    await adminClient
      .from('user_sectors')
      .delete()
      .eq('user_id', userId)
      .in('sector_id', toRemove);
  }

  // Adiciona marcados
  if (toAdd.length > 0) {
    await adminClient.from('user_sectors').insert(
      toAdd.map((sector_id) => ({
        user_id: userId,
        sector_id,
        assigned_by: user.id,
      }))
    );
  }

  // Se o setor ativo foi removido, zera active_sector_id
  if (toRemove.length > 0) {
    const { data: profileData } = await adminClient
      .from('profiles')
      .select('active_sector_id')
      .eq('id', userId)
      .single();

    if (profileData?.active_sector_id && toRemove.includes(profileData.active_sector_id)) {
      await adminClient
        .from('profiles')
        .update({ active_sector_id: null })
        .eq('id', userId);
    }
  }

  return { success: true };
}
```

- [ ] **Step 3: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -iE "error TS|Type error" | head -20
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add squados/src/features/auth/actions/auth-actions.ts \
        squados/src/features/users/actions/user-actions.ts
git commit -m "feat: add selectSectorAction, getUserSectorsAction, updateUserSectorsAction"
```

---

## Task 3: Página /select-sector

**Files:**
- Create: `squados/src/app/(auth)/select-sector/page.tsx`
- Create: `squados/src/features/auth/components/select-sector-form.tsx`

- [ ] **Step 1: Criar `select-sector-form.tsx` (client component)**

```tsx
// src/features/auth/components/select-sector-form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { selectSectorAction } from '../actions/auth-actions';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface SelectSectorFormProps {
  sectors: Sector[];
}

export function SelectSectorForm({ sectors }: SelectSectorFormProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSelect() {
    if (!selected) return;
    setLoading(true);
    setError('');
    const result = await selectSectorAction(selected);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
  }

  const selectedSector = sectors.find((s) => s.id === selected);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-primary">S</span>
          </div>
          <h1 className="text-xl font-bold">Em qual setor você vai trabalhar hoje?</h1>
          <p className="text-sm text-muted-foreground mt-1">Escolha um setor para continuar</p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {sectors.map((sector) => (
            <button
              key={sector.id}
              onClick={() => setSelected(sector.id)}
              className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                selected === sector.id
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              {sector.icon && (
                <span className="text-xl flex-shrink-0">{sector.icon}</span>
              )}
              <span className="font-medium text-sm">{sector.name}</span>
            </button>
          ))}
        </div>

        <button
          onClick={handleSelect}
          disabled={!selected || loading}
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {loading
            ? 'Entrando...'
            : selectedSector
            ? `Entrar no ${selectedSector.name}`
            : 'Selecione um setor'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `select-sector/page.tsx` (server component)**

```tsx
// src/app/(auth)/select-sector/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { SelectSectorForm } from '@/features/auth/components/select-sector-form';

export default async function SelectSectorPage() {
  const supabase = await createClient();

  // Verificar autenticação
  let userId: string | undefined;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    userId = user.id;
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) userId = session.user.id;
  }
  if (!userId) redirect('/login');

  const admin = createAdminClient();

  // Buscar setores do usuário
  const { data: userSectors } = await admin
    .from('user_sectors')
    .select('sector_id, sectors(id, name, icon)')
    .eq('user_id', userId);

  const sectors = (userSectors ?? []).map((us) => {
    const s = us.sectors as { id: string; name: string; icon: string | null } | null;
    return s ? { id: s.id, name: s.name, icon: s.icon } : null;
  }).filter(Boolean) as { id: string; name: string; icon: string | null }[];

  // Sem setores: vai para dashboard
  if (sectors.length === 0) redirect('/dashboard');

  // Só 1 setor: define automaticamente e redireciona
  if (sectors.length === 1) {
    await admin
      .from('profiles')
      .update({ active_sector_id: sectors[0].id })
      .eq('id', userId);
    redirect('/dashboard');
  }

  return <SelectSectorForm sectors={sectors} />;
}
```

- [ ] **Step 3: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -iE "error TS|Type error" | head -20
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add squados/src/app/\(auth\)/select-sector/page.tsx \
        squados/src/features/auth/components/select-sector-form.tsx
git commit -m "feat: add /select-sector page for multi-sector login flow"
```

---

## Task 4: Redirect pós-login + guard no layout

**Files:**
- Modify: `squados/src/features/auth/actions/auth-actions.ts`
- Modify: `squados/src/app/(app)/layout.tsx`

- [ ] **Step 1: Modificar redirect em `loginAction`**

Substitua o trecho final de `loginAction` em `auth-actions.ts`:

```ts
  // Após login bem-sucedido, verificar quantos setores o usuário tem
  const { data: { user: loggedUser } } = await supabase.auth.getUser();
  if (loggedUser) {
    const adminClient = createAdminClient();

    await adminClient
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', loggedUser.id);

    await adminClient.from('audit_logs').insert({
      user_id: loggedUser.id,
      action: 'login',
      resource_type: 'auth',
      details: { email: parsed.data.email },
      status: 'success',
    });

    // Verificar setores do usuário
    const { data: sectors } = await adminClient
      .from('user_sectors')
      .select('sector_id')
      .eq('user_id', loggedUser.id);

    const sectorCount = (sectors ?? []).length;

    if (sectorCount === 1) {
      // Auto-selecionar único setor
      await adminClient
        .from('profiles')
        .update({ active_sector_id: sectors![0].sector_id })
        .eq('id', loggedUser.id);
      redirect('/dashboard');
    }

    if (sectorCount >= 2) {
      redirect('/select-sector');
    }
  }

  redirect('/dashboard');
```

O `loginAction` completo ficará assim (substitua a função inteira):

```ts
export async function loginAction(formData: FormData) {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const adminClient = createAdminClient();
    await adminClient.from('audit_logs').insert({
      action: 'login',
      resource_type: 'auth',
      details: { email: parsed.data.email, error: error.message },
      status: 'failure',
    });
    return { error: 'Email ou senha incorretos' };
  }

  const { data: { user: loggedUser } } = await supabase.auth.getUser();
  if (loggedUser) {
    const adminClient = createAdminClient();

    await adminClient
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', loggedUser.id);

    await adminClient.from('audit_logs').insert({
      user_id: loggedUser.id,
      action: 'login',
      resource_type: 'auth',
      details: { email: parsed.data.email },
      status: 'success',
    });

    const { data: sectors } = await adminClient
      .from('user_sectors')
      .select('sector_id')
      .eq('user_id', loggedUser.id);

    const sectorCount = (sectors ?? []).length;

    if (sectorCount === 1) {
      await adminClient
        .from('profiles')
        .update({ active_sector_id: sectors![0].sector_id })
        .eq('id', loggedUser.id);
      redirect('/dashboard');
    }

    if (sectorCount >= 2) {
      redirect('/select-sector');
    }
  }

  redirect('/dashboard');
}
```

- [ ] **Step 2: Atualizar `(app)/layout.tsx` com redirect guard e dados de setor**

Substitua o conteúdo de `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { AppShell } from '@/shared/components/layout/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Buscar setores disponíveis para o usuário
  const { data: userSectorsData } = await admin
    .from('user_sectors')
    .select('sector_id, sectors(id, name, icon)')
    .eq('user_id', user.id);

  const userSectors = (userSectorsData ?? []).map((us) => {
    const s = us.sectors as { id: string; name: string; icon: string | null } | null;
    return s ? { id: s.id, name: s.name, icon: s.icon } : null;
  }).filter(Boolean) as { id: string; name: string; icon: string | null }[];

  // Se tem 2+ setores e nenhum ativo, força seleção
  if (userSectors.length >= 2 && !profile.active_sector_id) {
    redirect('/select-sector');
  }

  // Se tem 1 setor e nenhum ativo, auto-seleciona
  if (userSectors.length === 1 && !profile.active_sector_id) {
    await admin
      .from('profiles')
      .update({ active_sector_id: userSectors[0].id })
      .eq('id', user.id);
  }

  // Setor ativo
  const activeSector = userSectors.find((s) => s.id === profile.active_sector_id) ?? null;

  return (
    <AppShell
      profile={profile}
      userSectors={userSectors}
      activeSector={activeSector}
    >
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 3: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -iE "error TS|Type error" | head -20
```

Esperado: erros de tipo esperados sobre `userSectors`/`activeSector` não existirem em `AppShell` — serão corrigidos nas tasks seguintes.

- [ ] **Step 4: Commit**

```bash
git add squados/src/features/auth/actions/auth-actions.ts \
        squados/src/app/\(app\)/layout.tsx
git commit -m "feat: redirect to /select-sector after login when user has multiple sectors"
```

---

## Task 5: SectorSwitcher + AppShell + Sidebar

**Files:**
- Create: `squados/src/features/auth/components/sector-switcher.tsx`
- Modify: `squados/src/shared/components/layout/app-shell.tsx`
- Modify: `squados/src/shared/components/layout/sidebar.tsx`

- [ ] **Step 1: Criar `sector-switcher.tsx`**

```tsx
// src/features/auth/components/sector-switcher.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';
import { selectSectorAction } from '../actions/auth-actions';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface SectorSwitcherProps {
  sectors: Sector[];
  activeSector: Sector | null;
  collapsed?: boolean;
}

export function SectorSwitcher({ sectors, activeSector, collapsed = false }: SectorSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSwitch(sectorId: string) {
    if (sectorId === activeSector?.id) { setOpen(false); return; }
    setSwitching(true);
    setOpen(false);
    const result = await selectSectorAction(sectorId);
    if (!result.error) {
      router.refresh();
    }
    setSwitching(false);
  }

  if (!activeSector) return null;

  if (collapsed) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          title={activeSector.name}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))]"
        >
          <span className="text-base">{activeSector.icon ?? '🏢'}</span>
        </button>
        {open && (
          <div className="absolute left-full top-0 ml-2 w-44 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
            {sectors.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSwitch(s.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <span>{s.icon ?? '🏢'}</span>
                <span className="flex-1 text-left">{s.name}</span>
                {s.id === activeSector.id && <Check className="w-3 h-3 text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-foreground))]"
      >
        <span className="text-base flex-shrink-0">{activeSector.icon ?? '🏢'}</span>
        <span className="flex-1 text-sm font-medium truncate text-left">
          {switching ? 'Trocando...' : activeSector.name}
        </span>
        <ChevronDown className={`w-3 h-3 text-[hsl(var(--sidebar-muted))] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Trocar setor
          </p>
          {sectors.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSwitch(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="text-base flex-shrink-0">{s.icon ?? '🏢'}</span>
              <span className="flex-1 text-left">{s.name}</span>
              {s.id === activeSector.id && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Atualizar `app-shell.tsx` para aceitar e repassar props de setor**

Substitua o conteúdo de `app-shell.tsx`:

```tsx
'use client';

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
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        userRole={profile.role}
        userName={profile.full_name}
        userSectors={userSectors}
        activeSector={activeSector}
        onLogout={() => logoutAction()}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Atualizar `sidebar.tsx` para exibir `SectorSwitcher`**

Adicione os imports no topo de `sidebar.tsx`:

```tsx
import { SectorSwitcher } from '@/features/auth/components/sector-switcher';
```

Adicione as props na interface `SidebarProps`:

```tsx
interface SidebarProps {
  userRole: UserRole;
  userName: string;
  userSectors: { id: string; name: string; icon: string | null }[];
  activeSector: { id: string; name: string; icon: string | null } | null;
  onLogout: () => void;
}
```

Atualize a desestruturação da função:

```tsx
export function Sidebar({ userRole, userName, userSectors, activeSector, onLogout }: SidebarProps) {
```

Adicione o `SectorSwitcher` ANTES do botão de notificações no bloco `{/* User + collapse */}` — após o bloco do avatar/nome do usuário:

```tsx
        {/* Sector switcher — só exibe se o usuário tem 2+ setores */}
        {userSectors.length >= 2 && (
          <SectorSwitcher
            sectors={userSectors}
            activeSector={activeSector}
            collapsed={collapsed}
          />
        )}
```

O bloco final da sidebar ficará assim:

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

        {/* Sector switcher — só exibe se o usuário tem 2+ setores */}
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
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))]"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
```

- [ ] **Step 4: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -iE "error TS|Type error" | head -20
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add squados/src/features/auth/components/sector-switcher.tsx \
        squados/src/shared/components/layout/app-shell.tsx \
        squados/src/shared/components/layout/sidebar.tsx
git commit -m "feat: SectorSwitcher in sidebar for multi-sector users"
```

---

## Task 6: SectorCheckboxList + UserManagement

**Files:**
- Create: `squados/src/features/users/components/sector-checkbox-list.tsx`
- Modify: `squados/src/features/users/components/user-management.tsx`

- [ ] **Step 1: Criar `sector-checkbox-list.tsx`**

```tsx
// src/features/users/components/sector-checkbox-list.tsx
'use client';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface SectorCheckboxListProps {
  sectors: Sector[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function SectorCheckboxList({
  sectors,
  selectedIds,
  onChange,
  disabled = false,
}: SectorCheckboxListProps) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="space-y-2">
      {sectors.map((sector) => (
        <label
          key={sector.id}
          className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
            selectedIds.includes(sector.id)
              ? 'border-primary bg-primary/5'
              : 'border-input hover:bg-muted/30'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(sector.id)}
            onChange={() => toggle(sector.id)}
            disabled={disabled}
            className="accent-primary w-4 h-4 flex-shrink-0"
          />
          {sector.icon && <span className="text-base">{sector.icon}</span>}
          <span className="text-sm font-medium">{sector.name}</span>
        </label>
      ))}
      {sectors.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum setor ativo cadastrado.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Adicionar `sectors` e `userSectorIds` ao `UserManagement`**

O componente `UserManagement` precisa receber os setores disponíveis para mostrar os checkboxes. Localize a interface `UserWithSector` em `user-management.tsx` e adicione `sector_ids` opcional:

```tsx
interface UserWithSector {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  sector_id: string | null;
  created_at: string;
  sectors: { name: string; slug: string } | { name: string; slug: string }[] | null;
}
```

Atualize a interface de props do componente para aceitar `allSectors`:

```tsx
export function UserManagement({
  users,
  sectors,
  currentUserRole,
  allSectors,
}: {
  users: UserWithSector[];
  sectors: Sector[];
  currentUserRole: string;
  allSectors: { id: string; name: string; icon: string | null }[];
}) {
```

- [ ] **Step 3: Adicionar estado de setores no `UserManagement`**

Adicione os imports no topo:

```tsx
import { SectorCheckboxList } from './sector-checkbox-list';
import { getUserSectorsAction, updateUserSectorsAction } from '../actions/user-actions';
```

Adicione estados após `const canEditCredentials = ...`:

```tsx
  const [createSectorIds, setCreateSectorIds] = useState<string[]>([]);
  const [editSectorIds, setEditSectorIds] = useState<string[]>([]);
  const [loadingSectors, setLoadingSectors] = useState(false);
```

- [ ] **Step 4: Carregar setores ao abrir o dialog de edição**

Atualize a função `openEdit`:

```tsx
  async function openEdit(user: UserWithSector) {
    setEditUser(user);
    setEditName(user.full_name);
    setEditRole(user.role);
    setEditSector(user.sector_id ?? '');
    setEditPhone(user.phone ?? '');
    setEditStatus(user.status);
    setEditEmail('');
    setEditPassword('');
    setError('');
    setEditSectorIds([]);
    setEditOpen(true);

    // Carregar setores do usuário
    setLoadingSectors(true);
    const result = await getUserSectorsAction(user.id);
    if ('data' in result) {
      setEditSectorIds(result.data.map((d: { sector_id: string }) => d.sector_id));
    }
    setLoadingSectors(false);
  }
```

- [ ] **Step 5: Atualizar `handleCreate` para salvar setores**

Adicione após `router.refresh()` e antes do `setCreating(false)` no `handleCreate`:

A `handleCreate` usa um `<form action={handleCreate}>` com FormData. O upload de avatar já foi adicionado. Agora precisamos salvar setores. Como `handleCreate` recebe `formData` e já retorna `result.userId`, adicione após o bloco de avatar:

```tsx
    // Salvar setores
    if (result.userId && createSectorIds.length > 0) {
      await updateUserSectorsAction(result.userId, createSectorIds);
    }

    setCreateSectorIds([]);
```

- [ ] **Step 6: Atualizar `handleSaveEdit` para salvar setores**

Adicione ao final de `handleSaveEdit` (antes de `setEditOpen(false)`):

```tsx
    // Atualizar setores
    if (canEditCredentials) {
      await updateUserSectorsAction(editUser.id, editSectorIds);
    }
```

- [ ] **Step 7: Adicionar `SectorCheckboxList` no dialog de CRIAÇÃO**

No dialog de criação de usuário, **substitua** o bloco do select de setor:

```tsx
            {/* Setor — era um <select>, agora são checkboxes */}
            {canEditCredentials && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Setores permitidos <span className="text-muted-foreground">(opcional)</span>
                </label>
                <SectorCheckboxList
                  sectors={allSectors}
                  selectedIds={createSectorIds}
                  onChange={setCreateSectorIds}
                />
              </div>
            )}
```

- [ ] **Step 8: Adicionar `SectorCheckboxList` no dialog de EDIÇÃO**

No dialog de edição, **substitua** o bloco do select de setor pelo checkbox:

```tsx
              {canEditCredentials && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Setores permitidos</label>
                  {loadingSectors ? (
                    <p className="text-xs text-muted-foreground">Carregando setores...</p>
                  ) : (
                    <SectorCheckboxList
                      sectors={allSectors}
                      selectedIds={editSectorIds}
                      onChange={setEditSectorIds}
                    />
                  )}
                </div>
              )}
```

- [ ] **Step 9: Passar `allSectors` pela página de usuários**

Em `squados/src/app/(admin)/users/page.tsx`, adicione a query de todos os setores e passe para `UserManagement`:

Adicione após as queries existentes:

```tsx
  const { data: allSectorsData } = await admin
    .from('sectors')
    .select('id, name, icon')
    .eq('is_active', true)
    .order('name');
  const allSectors = allSectorsData ?? [];
```

Atualize o `<UserManagement ...>`:

```tsx
      <UserManagement
        users={users ?? []}
        sectors={sectors ?? []}
        currentUserRole={currentProfile.role}
        allSectors={allSectors}
      />
```

- [ ] **Step 10: Verificar build**

```bash
cd squados && npm run build 2>&1 | grep -iE "error TS|Type error" | head -20
```

Esperado: sem erros.

- [ ] **Step 11: Commit**

```bash
git add squados/src/features/users/components/sector-checkbox-list.tsx \
        squados/src/features/users/components/user-management.tsx \
        squados/src/app/\(admin\)/users/page.tsx
git commit -m "feat: multi-sector assignment in user create/edit (admin only)"
```

---

## Task 7: Atualizar dashboard + push

**Files:**
- Modify: `squados/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Substituir `sector_id` por `active_sector_id` no dashboard**

Em `dashboard/page.tsx`, localize:

```ts
  if (profile.sector_id) {
    const { data: sectorData } = await admin
      .from('sectors')
      ...
      .eq('id', profile.sector_id)
```

Substitua por:

```ts
  const effectiveSectorId = profile.active_sector_id ?? profile.sector_id;
  if (effectiveSectorId) {
    const { data: sectorData } = await admin
      .from('sectors')
      ...
      .eq('id', effectiveSectorId)
```

E onde `profile.sector_id` for usado nas queries subsequentes, substitua por `effectiveSectorId`.

- [ ] **Step 2: Verificar build final**

```bash
cd squados && npm run build 2>&1 | tail -20
```

Esperado: build sem erros, rotas listadas incluindo `/select-sector`.

- [ ] **Step 3: Push**

```bash
git add squados/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: use active_sector_id in dashboard for sector context"
git push origin main
```

- [ ] **Step 4: Aplicar migration em produção**

No Supabase Dashboard → SQL Editor, execute o conteúdo de:
`squados/supabase/migrations/00018_create_user_sectors.sql`

Verificar: tabela `user_sectors` criada, coluna `active_sector_id` em `profiles`, dados migrados de `profiles.sector_id`.

---

## Self-Review

**Cobertura do spec:**
- ✅ `user_sectors` com RLS (Task 1)
- ✅ `active_sector_id` em profiles (Task 1)
- ✅ Migração de `sector_id` existente (Task 1)
- ✅ `selectSectorAction` (Task 2)
- ✅ `getUserSectorsAction` / `updateUserSectorsAction` (Task 2)
- ✅ Página `/select-sector` — só aparece com 2+ setores (Task 3)
- ✅ Com 1 setor: auto-seleciona e redireciona (Tasks 3 e 4)
- ✅ Com 0 setores: entra direto (Task 3)
- ✅ `loginAction` redireciona para `/select-sector` se 2+ setores (Task 4)
- ✅ Guard em `(app)/layout.tsx` redireciona se `active_sector_id` null (Task 4)
- ✅ `SectorSwitcher` na sidebar para trocar setor sem logout (Task 5)
- ✅ Só exibido para usuários com 2+ setores (Task 5)
- ✅ Checkboxes na criação de usuário (Task 6)
- ✅ Checkboxes na edição de usuário com setores pré-carregados (Task 6)
- ✅ Somente admin/master_admin veem os checkboxes (Task 6 — `canEditCredentials`)
- ✅ Dashboard usa `active_sector_id` (Task 7)
- ✅ Se setor ativo for removido pelo admin, `active_sector_id` é zerado (Task 2)

**Consistência de tipos:**
- `Sector` interface `{ id, name, icon }` usada consistentemente em `sector-switcher.tsx`, `select-sector-form.tsx`, `app-shell.tsx`, `sidebar.tsx` e `(app)/layout.tsx`
- `selectSectorAction` chamado tanto em `select-sector-form.tsx` quanto em `sector-switcher.tsx` — mesmo import path
- `updateUserSectorsAction(userId: string, sectorIds: string[])` chamado em `handleCreate` e `handleSaveEdit` — assinatura consistente
