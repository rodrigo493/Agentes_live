# SquadOS — 4 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar aba Calendário dedicada, modal de evento melhorado, permissões de nav por usuário e catálogo global de processos.

**Architecture:** Quatro features independentes executadas em ordem crescente de complexidade. Features 1-3 são pequenas (1-3 arquivos cada). Feature 4 é a maior (novas tabelas, novos componentes, refactor do production-shell). Todas as migrations usam `createAdminClient` e seguem o padrão existente em `supabase/migrations/`.

**Tech Stack:** Next.js 15 App Router (Server Components + Server Actions), Supabase (Postgres + RLS + Storage), Tailwind CSS, shadcn/ui, TypeScript, date-fns, lucide-react.

---

## File Map

```
CRIAR:
  squados/supabase/migrations/00023_process_catalog.sql
  squados/supabase/migrations/00024_user_nav_permissions.sql
  squados/supabase/migrations/00025_calendar_attendees.sql
  squados/src/app/(app)/calendario/page.tsx
  squados/src/app/(app)/processos/page.tsx
  squados/src/features/processes/actions/catalog-actions.ts
  squados/src/features/processes/actions/assignment-actions.ts
  squados/src/features/processes/components/process-catalog-shell.tsx
  squados/src/features/processes/components/process-detail-modal.tsx
  squados/src/features/processes/components/process-form-modal.tsx
  squados/src/features/processes/components/process-picker-modal.tsx

MODIFICAR:
  squados/src/config/navigation.ts
  squados/src/shared/types/database.ts
  squados/src/shared/components/layout/sidebar.tsx
  squados/src/shared/components/layout/app-shell.tsx
  squados/src/app/(app)/layout.tsx
  squados/src/features/calendar/actions/calendar-actions.ts
  squados/src/features/calendar/components/calendar-section.tsx
  squados/src/features/users/components/user-management.tsx
  squados/src/features/users/actions/user-actions.ts
  squados/src/features/production/components/production-shell.tsx
  squados/src/app/(app)/producao/page.tsx
  squados/src/app/(app)/producao/usuario/[id]/page.tsx
```

---

## FEATURE 1 — Aba Calendário Dedicada

### Task 1: Criar página /calendario

**Files:**
- Create: `squados/src/app/(app)/calendario/page.tsx`

- [ ] **Step 1: Criar o server component**

```tsx
// squados/src/app/(app)/calendario/page.tsx
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { CalendarSection } from '@/features/calendar/components/calendar-section';
import { startOfWeek, endOfWeek, addWeeks } from 'date-fns';

export const metadata = { title: 'Calendário' };

export default async function CalendarioPage() {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const now = new Date();
  const calStart = startOfWeek(addWeeks(now, -4), { weekStartsOn: 0 }).toISOString();
  const calEnd   = endOfWeek(addWeeks(now, 4),   { weekStartsOn: 0 }).toISOString();

  const [eventsResult, tokenResult] = await Promise.all([
    admin
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('start_at', calStart)
      .lte('end_at', calEnd)
      .order('start_at'),
    admin
      .from('google_calendar_tokens')
      .select('google_email, calendar_id')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const googleConfigured = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  return (
    <div className="p-4 md:p-6">
      <CalendarSection
        currentUserId={user.id}
        initialCalendarEvents={eventsResult.data ?? []}
        googleConnected={!!tokenResult.data}
        googleEmail={tokenResult.data?.google_email}
        googleConfigured={googleConfigured}
      />
    </div>
  );
}
```

- [ ] **Step 2: Adicionar "Calendário" à navegação** em `squados/src/config/navigation.ts`

```ts
// Adicionar CalendarDays ao import de lucide-react:
import {
  LayoutDashboard, MessageSquare, Bot, Building2, FolderOpen,
  Brain, Shield, Users, UsersRound, Settings, BarChart3, Mic,
  Eye, Factory, Mail, Workflow, CalendarDays,
} from 'lucide-react';

// Adicionar após o item Produção no array NAV_ITEMS:
{ label: 'Calendário', href: '/calendario', icon: CalendarDays, minRole: 'viewer' },
```

- [ ] **Step 3: Remover CalendarSection de production-shell.tsx**

Em `squados/src/features/production/components/production-shell.tsx`:

a) Remover do import no topo:
```ts
// REMOVER esta linha:
import { CalendarSection } from '@/features/calendar/components/calendar-section';
```

b) Remover as props da interface `ProductionShellProps`:
```ts
// REMOVER estas 5 props:
  initialCalendarEvents: CalendarEvent[];
  googleConnected: boolean;
  googleEmail: string | null | undefined;
  googleConfigured: boolean;
  showCalendar?: boolean;
```

c) Remover do destructuring do componente:
```ts
// REMOVER do destructuring:
  initialCalendarEvents,
  googleConnected,
  googleEmail,
  googleConfigured,
  showCalendar = true,
```

d) Localizar e remover o bloco de renderização do CalendarSection (buscar por `showCalendar` ou `CalendarSection` no JSX e remover o bloco inteiro incluindo o wrapper).

- [ ] **Step 4: Remover fetches de calendário de producao/page.tsx**

Substituir o conteúdo de `squados/src/app/(app)/producao/page.tsx`:

```tsx
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getProductionDataAction } from '@/features/production/actions/production-actions';
import { getMyTasksAction } from '@/features/production/actions/task-actions';
import { ProductionShell } from '@/features/production/components/production-shell';

export const metadata = { title: 'Produção' };

export default async function ProducaoPage() {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const [
    { processes = [], media = [] },
    { tasks = [], completions = [] },
    contactsResult,
  ] = await Promise.all([
    getProductionDataAction(),
    getMyTasksAction(),
    isAdmin
      ? admin
          .from('profiles')
          .select('id, full_name, avatar_url, role')
          .eq('status', 'active')
          .is('deleted_at', null)
          .neq('id', user.id)
          .order('full_name')
      : Promise.resolve({ data: [] }),
  ]);

  const contacts = (contactsResult.data ?? []) as {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  }[];

  return (
    <ProductionShell
      initialProcesses={processes}
      initialMedia={media}
      initialTasks={tasks}
      initialCompletions={completions}
      currentUserId={user.id}
      targetUserId={user.id}
      contacts={contacts}
      isAdmin={isAdmin}
    />
  );
}
```

- [ ] **Step 5: Remover props de calendário de producao/usuario/[id]/page.tsx**

Substituir a chamada ao ProductionShell (linha ~92):
```tsx
<ProductionShell
  initialProcesses={processes}
  initialMedia={media}
  initialTasks={tasks}
  initialCompletions={completions}
  currentUserId={user.id}
  targetUserId={id}
  contacts={[]}
  isAdmin={isAdmin}
  showUserGrid={false}
/>
```

- [ ] **Step 6: Commit**
```bash
git add squados/src/app/(app)/calendario/page.tsx \
        squados/src/config/navigation.ts \
        squados/src/features/production/components/production-shell.tsx \
        squados/src/app/(app)/producao/page.tsx \
        squados/src/app/(app)/producao/usuario/
git commit -m "feat(calendar): mover CalendarSection para aba /calendario dedicada"
```

---

## FEATURE 2 — Modal de Detalhe do Calendário (Participantes + Fix X)

### Task 2: Migration e tipos para attendees

**Files:**
- Create: `squados/supabase/migrations/00025_calendar_attendees.sql`
- Modify: `squados/src/shared/types/database.ts`

- [ ] **Step 1: Criar migration**

```sql
-- squados/supabase/migrations/00025_calendar_attendees.sql
ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS attendees JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN calendar_events.attendees IS
  'Array of {email, name, response, organizer}. response: accepted|declined|tentative|needsAction';
```

- [ ] **Step 2: Aplicar migration no Supabase**
```bash
cd squados && npx supabase db push
```
Saída esperada: `Applying migration 00025_calendar_attendees.sql...`

- [ ] **Step 3: Atualizar tipos em database.ts**

Adicionar antes de `export interface CalendarEvent`:
```ts
export interface CalendarAttendee {
  email: string;
  name: string;
  response: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer: boolean;
}
```

Adicionar campo no `CalendarEvent`:
```ts
export interface CalendarEvent {
  // ... campos existentes ...
  attendees: CalendarAttendee[];  // adicionar esta linha
}
```

- [ ] **Step 4: Commit**
```bash
git add squados/supabase/migrations/00025_calendar_attendees.sql \
        squados/src/shared/types/database.ts
git commit -m "feat(calendar): adicionar campo attendees em calendar_events"
```

### Task 3: Atualizar actions do calendário

**Files:**
- Modify: `squados/src/features/calendar/actions/calendar-actions.ts`

- [ ] **Step 1: Mapear attendees no sync Google**

Em `syncFromGoogleAction`, dentro do bloco `if (existing)`, adicionar `attendees` ao update:
```ts
await admin.from('calendar_events').update({
  title:            ge.summary ?? '(sem título)',
  description:      ge.description ?? null,
  start_at:         startAt,
  end_at:           endAt,
  location:         ge.location ?? null,
  meet_url:         ge.hangoutLink ?? null,
  is_all_day:       !!ge.start.date,
  attendees: (ge.attendees ?? []).map((a: {
    email?: string; displayName?: string;
    responseStatus?: string; organizer?: boolean;
  }) => ({
    email: a.email ?? '',
    name: a.displayName ?? a.email ?? '',
    response: (a.responseStatus ?? 'needsAction') as 'accepted' | 'declined' | 'tentative' | 'needsAction',
    organizer: a.organizer ?? false,
  })),
  google_synced_at: new Date().toISOString(),
  updated_at:       new Date().toISOString(),
}).eq('id', existing.id);
```

No bloco `else` (insert), adicionar `attendees` também:
```ts
await admin.from('calendar_events').insert({
  user_id:          user.id,
  google_event_id:  ge.id,
  title:            ge.summary ?? '(sem título)',
  description:      ge.description ?? null,
  start_at:         startAt,
  end_at:           endAt,
  event_type:       'event',
  location:         ge.location ?? null,
  meet_url:         ge.hangoutLink ?? null,
  is_all_day:       !!ge.start.date,
  attendees: (ge.attendees ?? []).map((a: {
    email?: string; displayName?: string;
    responseStatus?: string; organizer?: boolean;
  }) => ({
    email: a.email ?? '',
    name: a.displayName ?? a.email ?? '',
    response: (a.responseStatus ?? 'needsAction') as 'accepted' | 'declined' | 'tentative' | 'needsAction',
    organizer: a.organizer ?? false,
  })),
  google_synced_at: new Date().toISOString(),
  created_by:       user.id,
});
```

- [ ] **Step 2: Adicionar `attendees` ao createCalendarEventAction**

Adicionar ao tipo do parâmetro `data`:
```ts
export async function createCalendarEventAction(data: {
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  event_type: 'task' | 'meeting' | 'call' | 'event';
  location?: string;
  meet_url?: string;
  is_all_day?: boolean;
  reminder_minutes?: number;
  attendees?: { email: string; name: string }[]; // ADICIONAR
```

Adicionar no `.insert({...})`:
```ts
attendees: (data.attendees ?? []).map(a => ({
  ...a,
  response: 'needsAction' as const,
  organizer: false,
})),
```

- [ ] **Step 3: Adicionar `attendees` ao updateCalendarEventAction**

Adicionar ao tipo `Partial<{...}>`:
```ts
attendees: { email: string; name: string; response: string; organizer: boolean }[] | null;
```

- [ ] **Step 4: Commit**
```bash
git add squados/src/features/calendar/actions/calendar-actions.ts
git commit -m "feat(calendar): mapear attendees no sync Google e em create/update"
```

### Task 4: Redesign do modal de detalhe em calendar-section.tsx

**Files:**
- Modify: `squados/src/features/calendar/components/calendar-section.tsx`

- [ ] **Step 1: Adicionar `Bell` e `FileText` aos imports de lucide-react** (se não existirem)

No bloco de imports de lucide-react, garantir que existem:
```ts
Bell, FileText, Users,
```

- [ ] **Step 2: Adicionar state para participantes no form**

Após os states existentes do form (buscar por `const [form, setForm]`), adicionar:
```ts
const [formAttendees, setFormAttendees] = useState(''); // emails separados por vírgula
```

- [ ] **Step 3: Adicionar campo de participantes no formulário criar/editar**

No JSX do form (dentro do `DialogContent` do form, após o campo `meet_url` ou `reminder_minutes`), adicionar:
```tsx
{/* Participantes */}
<div className="space-y-1.5">
  <Label className="text-xs">Participantes (opcional)</Label>
  <input
    type="text"
    value={formAttendees}
    onChange={(e) => setFormAttendees(e.target.value)}
    placeholder="email1@exemplo.com, email2@exemplo.com"
    className="w-full h-9 rounded-md border border-input bg-muted px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
  />
  <p className="text-[10px] text-muted-foreground">Emails separados por vírgula</p>
</div>
```

- [ ] **Step 4: Passar attendees ao salvar evento**

Na função que chama `createCalendarEventAction` e `updateCalendarEventAction`, adicionar:
```ts
attendees: formAttendees
  .split(',')
  .map(e => e.trim())
  .filter(Boolean)
  .map(email => ({ email, name: email })),
```

- [ ] **Step 5: Ao abrir edição de evento existente, popular formAttendees**

Na função `openEdit` (ou onde `form` é setado ao editar), adicionar:
```ts
setFormAttendees(
  (event.attendees ?? []).map((a) => a.email).join(', ')
);
```

- [ ] **Step 6: Redesenhar o modal de detalhe**

Localizar o bloco `{/* ─── Modal: Detalhe do Evento ─── */}` (em torno da linha 906) e substituir o conteúdo do `DialogContent`:

```tsx
{/* ─── Modal: Detalhe do Evento ─── */}
<Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
  <DialogContent className="max-w-md [&>button]:hidden">
    {detail && (() => {
      const c = EVENT_COLORS[detail.event_type];
      const Icon = EVENT_ICONS[detail.event_type];
      const responseIcon: Record<string, string> = {
        accepted: '✅', declined: '❌', tentative: '🔸', needsAction: '❓',
      };
      const responseLabel: Record<string, string> = {
        accepted: 'Confirmado', declined: 'Recusou',
        tentative: 'Talvez', needsAction: 'Aguardando',
      };
      return (
        <>
          {/* Header colorido */}
          <div className={`-mx-6 -mt-6 px-6 pt-5 pb-4 rounded-t-lg ${c.bg}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Icon className="w-5 h-5 text-white flex-shrink-0" />
                <DialogTitle className="text-white text-base font-bold leading-snug truncate">
                  {detail.title}
                </DialogTitle>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => openEdit(detail, e)}
                  className="p-1 rounded bg-white/20 hover:bg-white/30"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5 text-white" />
                </button>
                <button
                  onClick={() => handleDelete(detail.id)}
                  className="p-1 rounded bg-white/20 hover:bg-white/30"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5 text-white" />
                </button>
                <button
                  onClick={() => setDetail(null)}
                  className="p-1 rounded bg-white/20 hover:bg-white/30 ml-1"
                  title="Fechar"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
            <p className="text-white/80 text-xs mt-1.5">
              {detail.is_all_day
                ? format(new Date(detail.start_at), "EEEE, d 'de' MMMM", { locale: ptBR })
                : `${format(new Date(detail.start_at), "EEEE, d 'de' MMMM · HH:mm", { locale: ptBR })} – ${format(new Date(detail.end_at), 'HH:mm')}`
              }
            </p>
          </div>

          {/* Corpo */}
          <div className="space-y-3 pt-2">
            {detail.description && (
              <div className="flex gap-2.5 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="whitespace-pre-wrap">{detail.description}</p>
              </div>
            )}

            {detail.location && (
              <div className="flex gap-2.5 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                {detail.location.startsWith('http') ? (
                  <a href={detail.location} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                    {detail.location}
                  </a>
                ) : (
                  <span>{detail.location}</span>
                )}
              </div>
            )}

            {detail.meet_url && (
              <div className="flex gap-2.5 text-sm">
                <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <a
                  href={detail.meet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary hover:underline"
                >
                  Entrar na reunião
                </a>
              </div>
            )}

            {detail.attendees && detail.attendees.length > 0 && (
              <div className="flex gap-2.5">
                <Users className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                    Participantes ({detail.attendees.length})
                  </p>
                  <div className="space-y-1.5">
                    {detail.attendees.map((a, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
                          <span className="truncate">{a.name || a.email}</span>
                          {a.organizer && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                              organizador
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
                          {responseIcon[a.response]} {responseLabel[a.response]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <Bell className="w-3.5 h-3.5" />
              Lembrete {detail.reminder_minutes} min antes
              {detail.google_event_id && (
                <Badge variant="secondary" className="text-[10px] gap-1 ml-auto">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Google
                </Badge>
              )}
            </div>
          </div>
        </>
      );
    })()}
  </DialogContent>
</Dialog>
```

- [ ] **Step 7: Garantir que `X` está importado de lucide-react** (já deve estar — confirmar no bloco de imports)

- [ ] **Step 8: Commit**
```bash
git add squados/src/features/calendar/components/calendar-section.tsx
git commit -m "feat(calendar): redesign modal detalhe com participantes e fix botão X"
```

---

## FEATURE 3 — Permissões de Navegação por Usuário

### Task 5: Migration e tipos para allowed_nav_items

**Files:**
- Create: `squados/supabase/migrations/00024_user_nav_permissions.sql`
- Modify: `squados/src/shared/types/database.ts`

- [ ] **Step 1: Criar migration**

```sql
-- squados/supabase/migrations/00024_user_nav_permissions.sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS allowed_nav_items TEXT[] DEFAULT NULL;

COMMENT ON COLUMN profiles.allowed_nav_items IS
  'NULL = padrão [/workspace, /email, /chat, /calendario]. Array = itens permitidos explicitamente.';
```

- [ ] **Step 2: Aplicar migration**
```bash
cd squados && npx supabase db push
```

- [ ] **Step 3: Adicionar campo ao tipo Profile em database.ts**

```ts
export interface Profile {
  // ... campos existentes ...
  allowed_nav_items: string[] | null;  // adicionar após deleted_at
}
```

- [ ] **Step 4: Commit**
```bash
git add squados/supabase/migrations/00024_user_nav_permissions.sql \
        squados/src/shared/types/database.ts
git commit -m "feat(nav): adicionar allowed_nav_items em profiles"
```

### Task 6: Atualizar sidebar e app-shell

**Files:**
- Modify: `squados/src/shared/components/layout/sidebar.tsx`
- Modify: `squados/src/shared/components/layout/app-shell.tsx`
- Modify: `squados/src/app/(app)/layout.tsx`
- Modify: `squados/src/config/navigation.ts`

- [ ] **Step 1: Adicionar helper `getNavItemsForUser` em navigation.ts**

Adicionar após a função `getNavItemsForRole` existente:

```ts
const DEFAULT_NAV_ITEMS = ['/workspace', '/email', '/chat', '/calendario'];

export function getNavItemsForUser(
  role: UserRole,
  allowedNavItems: string[] | null
): NavItem[] {
  const roleLevel = ['viewer', 'operator', 'manager', 'admin', 'master_admin'].indexOf(role);
  const isAdmin = role === 'admin' || role === 'master_admin';

  return NAV_ITEMS.filter((item) => {
    const minLevel = ['viewer', 'operator', 'manager', 'admin', 'master_admin'].indexOf(item.minRole);
    if (roleLevel < minLevel) return false; // teto de segurança
    if (isAdmin) return true; // admins veem tudo
    const allowed = allowedNavItems ?? DEFAULT_NAV_ITEMS;
    return allowed.includes(item.href);
  });
}
```

- [ ] **Step 2: Atualizar SidebarProps para receber allowedNavItems**

Em `sidebar.tsx`, atualizar a interface e o componente:

```ts
interface SidebarProps {
  userRole: UserRole;
  userName: string;
  userSectors: { id: string; name: string; icon: string | null }[];
  activeSector: { id: string; name: string; icon: string | null } | null;
  allowedNavItems: string[] | null;  // ADICIONAR
  onLogout: () => void;
  onClose?: () => void;
}
```

Atualizar o import de navigation:
```ts
import { getNavItemsForUser } from '@/config/navigation';
```

Atualizar dentro do componente `Sidebar`:
```ts
// Substituir:
const navItems = getNavItemsForRole(userRole);
// Por:
const navItems = getNavItemsForUser(userRole, allowedNavItems);
```

- [ ] **Step 3: Passar allowedNavItems no AppShell**

Em `app-shell.tsx`, atualizar `AppShellProps`:
```ts
interface AppShellProps {
  profile: Profile;
  userSectors: Sector[];
  activeSector: Sector | null;
  children: React.ReactNode;
}
```

Passar `profile.allowed_nav_items` para ambas as instâncias do `Sidebar` (desktop e mobile drawer):
```tsx
<Sidebar
  userRole={profile.role}
  userName={profile.full_name}
  userSectors={userSectors}
  activeSector={activeSector}
  allowedNavItems={profile.allowed_nav_items}
  onLogout={() => logoutAction()}
/>
```
(Fazer o mesmo para o Sidebar dentro do `SheetContent`)

- [ ] **Step 4: Commit**
```bash
git add squados/src/config/navigation.ts \
        squados/src/shared/components/layout/sidebar.tsx \
        squados/src/shared/components/layout/app-shell.tsx
git commit -m "feat(nav): sidebar filtra itens por allowed_nav_items por usuário"
```

### Task 7: UI de permissões no modal de usuário

**Files:**
- Modify: `squados/src/features/users/components/user-management.tsx`
- Modify: `squados/src/features/users/actions/user-actions.ts`

- [ ] **Step 1: Adicionar state para nav items no user-management.tsx**

Após os states existentes de edição, adicionar:
```ts
const [navItems, setNavItems] = useState<string[]>([]);
```

- [ ] **Step 2: Adicionar constante com os itens de nav disponíveis para não-admins**

No topo do componente (fora do JSX), adicionar:
```ts
const NAV_ITEMS_FOR_NON_ADMIN = [
  { href: '/dashboard',   label: 'Dashboard' },
  { href: '/workspace',   label: 'Workspace' },
  { href: '/email',       label: 'E-mails' },
  { href: '/producao',    label: 'Produção' },
  { href: '/calendario',  label: 'Calendário' },
  { href: '/chat',        label: 'Chat com Agente' },
  { href: '/operations',  label: 'Operações' },
  { href: '/sectors',     label: 'Setores' },
  { href: '/knowledge',   label: 'Conhecimento' },
  { href: '/memory',      label: 'Memória' },
  { href: '/audit',       label: 'Auditoria' },
  { href: '/settings',    label: 'Configurações' },
];

const DEFAULT_NAV = ['/workspace', '/email', '/chat', '/calendario'];
```

- [ ] **Step 3: Popular navItems ao abrir modal de edição**

Na função que abre o modal de edição (buscar por `setEditUser` ou `setEditOpen(true)`), adicionar:
```ts
setNavItems(userToEdit.allowed_nav_items ?? DEFAULT_NAV);
```

- [ ] **Step 4: Inicializar navItems ao abrir modal de criação**

Na função que abre o modal de criação:
```ts
setNavItems(DEFAULT_NAV);
```

- [ ] **Step 5: Adicionar seção de checkboxes no modal criar/editar**

No JSX do modal (após a seção de Setores, que usa `SectorCheckboxList`), adicionar:

```tsx
{/* Acesso à barra lateral — só para non-admin */}
{(() => {
  const targetRole = editUser ? editUser.role : (formData.role ?? 'operator');
  if (targetRole === 'admin' || targetRole === 'master_admin') return null;
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Acesso à barra lateral</Label>
      <p className="text-xs text-muted-foreground">Itens visíveis para este usuário</p>
      <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-2 rounded-md border border-input">
        {NAV_ITEMS_FOR_NON_ADMIN.map((item) => (
          <label key={item.href} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
            <input
              type="checkbox"
              checked={navItems.includes(item.href)}
              onChange={(e) => {
                setNavItems(prev =>
                  e.target.checked
                    ? [...prev, item.href]
                    : prev.filter(h => h !== item.href)
                );
              }}
              className="rounded"
            />
            {item.label}
          </label>
        ))}
      </div>
    </div>
  );
})()}
```

- [ ] **Step 6: Passar navItems ao salvar**

Na função que chama `createUserAction`, adicionar `allowed_nav_items: navItems` ao FormData ou ao objeto de dados.

Na função que chama `updateUserAction`, adicionar `allowed_nav_items: navItems`.

- [ ] **Step 7: Atualizar user-actions.ts para salvar allowed_nav_items**

Em `createUserAction`, após o update do profile, adicionar:
```ts
await adminClient
  .from('profiles')
  .update({ allowed_nav_items: formData.get('allowed_nav_items') 
    ? JSON.parse(formData.get('allowed_nav_items') as string) 
    : null })
  .eq('id', newUser.user.id);
```

Em `updateUserAction`, aceitar e salvar `allowed_nav_items`:
```ts
// No tipo de data, adicionar:
allowed_nav_items?: string[] | null;

// No update do Supabase, incluir se presente:
if ('allowed_nav_items' in data) {
  updateData.allowed_nav_items = data.allowed_nav_items;
}
```

- [ ] **Step 8: Commit**
```bash
git add squados/src/features/users/components/user-management.tsx \
        squados/src/features/users/actions/user-actions.ts
git commit -m "feat(nav): controle de itens da sidebar por usuário no modal de edição"
```

---

## FEATURE 4 — Catálogo Global de Processos

### Task 8: Migration do catálogo

**Files:**
- Create: `squados/supabase/migrations/00023_process_catalog.sql`

- [ ] **Step 1: Criar migration**

```sql
-- squados/supabase/migrations/00023_process_catalog.sql

-- ── Catálogo global de processos ────────────────────────────
CREATE TABLE IF NOT EXISTS process_catalog (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id    UUID REFERENCES sectors(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  color        TEXT NOT NULL DEFAULT 'violet',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Mídias do catálogo ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS process_catalog_media (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_process_id  UUID NOT NULL REFERENCES process_catalog(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('image', 'video')),
  url                 TEXT NOT NULL,
  caption             TEXT,
  order_index         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Atribuições por usuário ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_process_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  catalog_process_id  UUID NOT NULL REFERENCES process_catalog(id) ON DELETE CASCADE,
  order_index         INTEGER NOT NULL DEFAULT 0,
  color               TEXT NOT NULL DEFAULT 'violet',
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, catalog_process_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS process_catalog_sector_idx ON process_catalog(sector_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS process_catalog_media_idx ON process_catalog_media(catalog_process_id);
CREATE INDEX IF NOT EXISTS user_process_assignments_user_idx ON user_process_assignments(user_id);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE process_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_catalog_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_process_assignments ENABLE ROW LEVEL SECURITY;

-- process_catalog: leitura para todos, escrita só admin+
CREATE POLICY proc_cat_select ON process_catalog
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY proc_cat_insert ON process_catalog
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY proc_cat_update ON process_catalog
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY proc_cat_delete ON process_catalog
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

-- process_catalog_media: leitura para todos, escrita só admin+
CREATE POLICY proc_cat_media_select ON process_catalog_media
  FOR SELECT TO authenticated USING (true);

CREATE POLICY proc_cat_media_insert ON process_catalog_media
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY proc_cat_media_delete ON process_catalog_media
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

-- user_process_assignments: usuário lê os seus, admin lê todos, só admin escreve
CREATE POLICY upa_select ON user_process_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY upa_insert ON user_process_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY upa_delete ON user_process_assignments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

CREATE POLICY upa_update ON user_process_assignments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master_admin'))
  );

-- ── Migração de dados existentes ────────────────────────────
-- Migrar production_processes → process_catalog (sem setor)
INSERT INTO process_catalog (id, title, description, color, is_active, created_by, created_at, updated_at)
SELECT id, title, description, color, is_active, created_by, created_at, updated_at
FROM production_processes
WHERE is_active = true
ON CONFLICT (id) DO NOTHING;

-- Migrar production_media → process_catalog_media
INSERT INTO process_catalog_media (id, catalog_process_id, type, url, caption, order_index, created_at)
SELECT id, process_id, type, url, caption, order_index, created_at
FROM production_media
ON CONFLICT (id) DO NOTHING;

-- Migrar vínculos assigned_to → user_process_assignments
INSERT INTO user_process_assignments (user_id, catalog_process_id, order_index, color, created_at)
SELECT assigned_to, id, order_index, color, created_at
FROM production_processes
WHERE is_active = true AND assigned_to IS NOT NULL
ON CONFLICT (user_id, catalog_process_id) DO NOTHING;
```

- [ ] **Step 2: Aplicar migration**
```bash
cd squados && npx supabase db push
```

- [ ] **Step 3: Commit**
```bash
git add squados/supabase/migrations/00023_process_catalog.sql
git commit -m "feat(processes): migration process_catalog + user_process_assignments"
```

### Task 9: Tipos e actions do catálogo

**Files:**
- Modify: `squados/src/shared/types/database.ts`
- Create: `squados/src/features/processes/actions/catalog-actions.ts`
- Create: `squados/src/features/processes/actions/assignment-actions.ts`

- [ ] **Step 1: Adicionar tipos em database.ts**

```ts
// Adicionar após os tipos de Production existentes:

export interface ProcessCatalog {
  id: string;
  sector_id: string | null;
  title: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessCatalogMedia {
  id: string;
  catalog_process_id: string;
  type: 'image' | 'video';
  url: string;
  caption: string | null;
  order_index: number;
  created_at: string;
}

export interface UserProcessAssignment {
  id: string;
  user_id: string;
  catalog_process_id: string;
  order_index: number;
  color: string;
  created_by: string | null;
  created_at: string;
}

// Tipo rico usado nos componentes (join)
export interface AssignedProcess {
  assignment_id: string;
  catalog_process_id: string;
  order_index: number;
  color: string;
  title: string;
  description: string | null;
  sector_id: string | null;
  sector_name: string | null;
  media: ProcessCatalogMedia[];
}

// Tipo rico do catálogo (com setor e mídias)
export interface ProcessCatalogFull extends ProcessCatalog {
  sector_name: string | null;
  sector_icon: string | null;
  media: ProcessCatalogMedia[];
}
```

- [ ] **Step 2: Criar catalog-actions.ts**

```ts
// squados/src/features/processes/actions/catalog-actions.ts
'use server';

import { requirePermission, getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { ProcessCatalog, ProcessCatalogMedia, ProcessCatalogFull } from '@/shared/types/database';

export async function getCatalogAction(): Promise<{
  processes?: ProcessCatalogFull[];
  error?: string;
}> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('process_catalog')
    .select(`
      *,
      sectors(name, icon),
      process_catalog_media(*)
    `)
    .eq('is_active', true)
    .order('title');

  if (error) return { error: error.message };

  const processes = (data ?? []).map((p) => ({
    ...p,
    sector_name: (p.sectors as { name: string } | null)?.name ?? null,
    sector_icon: (p.sectors as { icon: string } | null)?.icon ?? null,
    media: (p.process_catalog_media ?? []) as ProcessCatalogMedia[],
  })) as ProcessCatalogFull[];

  return { processes };
}

export async function createCatalogProcessAction(data: {
  sector_id?: string | null;
  title: string;
  description?: string;
  color?: string;
}): Promise<{ process?: ProcessCatalog; error?: string }> {
  const { user } = await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: process, error } = await admin
    .from('process_catalog')
    .insert({
      sector_id:   data.sector_id ?? null,
      title:       data.title.trim(),
      description: data.description?.trim() || null,
      color:       data.color || 'violet',
      created_by:  user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { process: process as ProcessCatalog };
}

export async function updateCatalogProcessAction(
  id: string,
  data: { sector_id?: string | null; title?: string; description?: string | null; color?: string }
): Promise<{ process?: ProcessCatalog; error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: process, error } = await admin
    .from('process_catalog')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { process: process as ProcessCatalog };
}

export async function deleteCatalogProcessAction(id: string): Promise<{ error?: string }> {
  await requirePermission('production', 'manage');
  const admin = createAdminClient();

  const { error } = await admin
    .from('process_catalog')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}

export async function addCatalogMediaAction(data: {
  catalog_process_id: string;
  type: 'image' | 'video';
  url: string;
  caption?: string;
}): Promise<{ media?: ProcessCatalogMedia; error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: last } = await admin
    .from('process_catalog_media')
    .select('order_index')
    .eq('catalog_process_id', data.catalog_process_id)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: media, error } = await admin
    .from('process_catalog_media')
    .insert({
      catalog_process_id: data.catalog_process_id,
      type:        data.type,
      url:         data.url,
      caption:     data.caption?.trim() || null,
      order_index: (last?.order_index ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { media: media as ProcessCatalogMedia };
}

export async function deleteCatalogMediaAction(id: string): Promise<{ error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();
  const { error } = await admin.from('process_catalog_media').delete().eq('id', id);
  if (error) return { error: error.message };
  return {};
}
```

- [ ] **Step 3: Criar assignment-actions.ts**

```ts
// squados/src/features/processes/actions/assignment-actions.ts
'use server';

import { requirePermission, getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { AssignedProcess, ProcessCatalogMedia } from '@/shared/types/database';

export async function getAssignmentsAction(targetUserId?: string): Promise<{
  assignments?: AssignedProcess[];
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const userId = targetUserId ?? user.id;
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin && userId !== user.id) return { error: 'Acesso negado' };

  const { data, error } = await admin
    .from('user_process_assignments')
    .select(`
      id,
      catalog_process_id,
      order_index,
      color,
      process_catalog!catalog_process_id(
        title, description, sector_id,
        sectors(name),
        process_catalog_media(*)
      )
    `)
    .eq('user_id', userId)
    .order('order_index');

  if (error) return { error: error.message };

  const assignments = (data ?? []).map((row) => {
    const cat = row.process_catalog as {
      title: string; description: string | null; sector_id: string | null;
      sectors: { name: string } | null;
      process_catalog_media: ProcessCatalogMedia[];
    } | null;
    return {
      assignment_id: row.id,
      catalog_process_id: row.catalog_process_id,
      order_index: row.order_index,
      color: row.color,
      title: cat?.title ?? '',
      description: cat?.description ?? null,
      sector_id: cat?.sector_id ?? null,
      sector_name: cat?.sectors?.name ?? null,
      media: cat?.process_catalog_media ?? [],
    } as AssignedProcess;
  });

  return { assignments };
}

export async function addAssignmentsAction(
  userId: string,
  catalogProcessIds: string[]
): Promise<{ error?: string }> {
  const { user } = await requirePermission('production', 'write');
  const admin = createAdminClient();

  const { data: last } = await admin
    .from('user_process_assignments')
    .select('order_index')
    .eq('user_id', userId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextOrder = (last?.order_index ?? -1) + 1;

  const rows = catalogProcessIds.map((catalog_process_id) => ({
    user_id: userId,
    catalog_process_id,
    order_index: nextOrder++,
    color: 'violet',
    created_by: user.id,
  }));

  const { error } = await admin
    .from('user_process_assignments')
    .insert(rows)
    .select();

  // Ignorar conflito UNIQUE (processo já atribuído)
  if (error && !error.message.includes('duplicate') && !error.message.includes('unique')) {
    return { error: error.message };
  }
  return {};
}

export async function removeAssignmentAction(assignmentId: string): Promise<{ error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();
  const { error } = await admin
    .from('user_process_assignments')
    .delete()
    .eq('id', assignmentId);
  if (error) return { error: error.message };
  return {};
}

export async function reorderAssignmentsAction(
  orderedAssignmentIds: string[]
): Promise<{ error?: string }> {
  await requirePermission('production', 'write');
  const admin = createAdminClient();

  await Promise.all(
    orderedAssignmentIds.map((id, index) =>
      admin
        .from('user_process_assignments')
        .update({ order_index: index })
        .eq('id', id)
    )
  );
  return {};
}
```

- [ ] **Step 4: Commit**
```bash
git add squados/src/shared/types/database.ts \
        squados/src/features/processes/actions/
git commit -m "feat(processes): tipos e server actions para catálogo e atribuições"
```

### Task 10: Componentes da aba Processos

**Files:**
- Create: `squados/src/features/processes/components/process-detail-modal.tsx`
- Create: `squados/src/features/processes/components/process-form-modal.tsx`
- Create: `squados/src/features/processes/components/process-catalog-shell.tsx`
- Create: `squados/src/app/(app)/processos/page.tsx`

- [ ] **Step 1: Criar process-detail-modal.tsx** (visualização de instruções — igual ao modal atual do ProductionShell)

```tsx
// squados/src/features/processes/components/process-detail-modal.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video, X } from 'lucide-react';
import type { ProcessCatalogFull } from '@/shared/types/database';

function getVideoEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

function isVideoUrl(url: string): boolean {
  return /youtube|youtu\.be|vimeo|\.mp4|\.webm/i.test(url);
}

interface ProcessDetailModalProps {
  process: ProcessCatalogFull | null;
  open: boolean;
  onClose: () => void;
}

export function ProcessDetailModal({ process, open, onClose }: ProcessDetailModalProps) {
  const [mediaIdx, setMediaIdx] = useState(0);

  if (!process) return null;
  const sortedMedia = [...process.media].sort((a, b) => a.order_index - b.order_index);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg [&>button]:hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-base font-bold leading-snug">{process.title}</DialogTitle>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        {process.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{process.description}</p>
        )}

        {sortedMedia.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />{sortedMedia.filter(m => m.type === 'image').length}
                <Video className="w-3 h-3 ml-2" />{sortedMedia.filter(m => m.type === 'video').length}
              </span>
              <span>{mediaIdx + 1} / {sortedMedia.length}</span>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-muted aspect-video">
              {(() => {
                const m = sortedMedia[mediaIdx];
                if (!m) return null;
                if (m.type === 'video' || isVideoUrl(m.url)) {
                  return (
                    <iframe
                      src={getVideoEmbedUrl(m.url)}
                      className="w-full h-full"
                      allowFullScreen
                      title={m.caption ?? 'vídeo'}
                    />
                  );
                }
                return <img src={m.url} alt={m.caption ?? ''} className="w-full h-full object-contain" />;
              })()}
            </div>
            {sortedMedia.length > 1 && (
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setMediaIdx(i => Math.max(0, i - 1))} disabled={mediaIdx === 0}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMediaIdx(i => Math.min(sortedMedia.length - 1, i + 1))} disabled={mediaIdx === sortedMedia.length - 1}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            {sortedMedia[mediaIdx]?.caption && (
              <p className="text-xs text-center text-muted-foreground">{sortedMedia[mediaIdx].caption}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Criar process-form-modal.tsx** (criar/editar processo do catálogo)

```tsx
// squados/src/features/processes/components/process-form-modal.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Upload, Link2, Image as ImageIcon, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createCatalogProcessAction,
  updateCatalogProcessAction,
  addCatalogMediaAction,
  deleteCatalogMediaAction,
} from '../actions/catalog-actions';
import type { ProcessCatalogFull, ProcessCatalogMedia, Sector } from '@/shared/types/database';

const COLOR_OPTIONS = [
  { value: 'violet', label: 'Violeta' }, { value: 'blue', label: 'Azul' },
  { value: 'emerald', label: 'Verde' }, { value: 'amber', label: 'Âmbar' },
  { value: 'rose', label: 'Rosa' }, { value: 'slate', label: 'Cinza' },
];

interface ProcessFormModalProps {
  open: boolean;
  process: ProcessCatalogFull | null; // null = criar
  sectors: Sector[];
  onClose: () => void;
  onSaved: (process: ProcessCatalogFull) => void;
}

export function ProcessFormModal({ open, process, sectors, onClose, onSaved }: ProcessFormModalProps) {
  const supabase = createClient();
  const [title, setTitle] = useState(process?.title ?? '');
  const [description, setDescription] = useState(process?.description ?? '');
  const [sectorId, setSectorId] = useState<string>(process?.sector_id ?? '');
  const [color, setColor] = useState(process?.color ?? 'violet');
  const [media, setMedia] = useState<ProcessCatalogMedia[]>(process?.media ?? []);
  const [saving, setSaving] = useState(false);

  // Media state
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        sector_id: sectorId || null,
        title,
        description: description || undefined,
        color,
      };

      if (process) {
        const res = await updateCatalogProcessAction(process.id, payload);
        if (res.error) { toast.error(res.error); return; }
        onSaved({ ...process, ...res.process!, sector_name: process.sector_name, sector_icon: process.sector_icon, media });
      } else {
        const res = await createCatalogProcessAction(payload);
        if (res.error) { toast.error(res.error); return; }
        const sector = sectors.find(s => s.id === sectorId);
        onSaved({
          ...res.process!,
          sector_name: sector?.name ?? null,
          sector_icon: sector?.icon ?? null,
          media: [],
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMedia() {
    if (!process) return;
    setUploadingMedia(true);
    try {
      let finalUrl = mediaUrl;
      if (mediaType === 'image' && mediaFile) {
        const ext = mediaFile.name.split('.').pop() ?? 'jpg';
        const path = `${process.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('production-media')
          .upload(path, mediaFile, { upsert: true });
        if (upErr) { toast.error('Falha no upload: ' + upErr.message); return; }
        const { data: urlData } = supabase.storage.from('production-media').getPublicUrl(path);
        finalUrl = urlData.publicUrl;
      }
      if (!finalUrl.trim()) { toast.error('Informe a URL ou selecione um arquivo'); return; }
      const res = await addCatalogMediaAction({
        catalog_process_id: process.id,
        type: mediaType,
        url: finalUrl,
        caption: mediaCaption,
      });
      if (res.error) { toast.error(res.error); return; }
      setMedia(prev => [...prev, res.media!]);
      setMediaUrl('');
      setMediaCaption('');
      setMediaFile(null);
      toast.success('Mídia adicionada');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleDeleteMedia(id: string) {
    const res = await deleteCatalogMediaAction(id);
    if (res.error) { toast.error(res.error); return; }
    setMedia(prev => prev.filter(m => m.id !== id));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{process ? 'Editar Processo' : 'Novo Processo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Setor</Label>
            <select
              value={sectorId}
              onChange={e => setSectorId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-muted px-3 text-sm"
            >
              <option value="">Sem setor</option>
              {sectors.map(s => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome do processo" />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Instruções..." rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`px-3 py-1 rounded-md text-xs border-2 transition-all ${
                    color === c.value ? 'border-primary font-bold' : 'border-border'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mídias — só disponível ao editar */}
          {process && (
            <div className="space-y-2 border-t border-border pt-4">
              <Label>Mídias ({media.length})</Label>
              {media.length > 0 && (
                <ScrollArea className="h-32">
                  {media.map(m => (
                    <div key={m.id} className="flex items-center gap-2 py-1 text-sm">
                      {m.type === 'image' ? <ImageIcon className="w-4 h-4 flex-shrink-0" /> : <Video className="w-4 h-4 flex-shrink-0" />}
                      <span className="flex-1 truncate text-xs">{m.caption || m.url}</span>
                      <button onClick={() => handleDeleteMedia(m.id)} className="p-0.5 hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </ScrollArea>
              )}

              <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
                <div className="flex gap-2">
                  {(['image', 'video'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setMediaType(t)}
                      className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                        mediaType === t ? 'bg-primary text-primary-foreground border-transparent' : 'border-input'
                      }`}
                    >
                      {t === 'image' ? 'Imagem' : 'Vídeo'}
                    </button>
                  ))}
                </div>

                {mediaType === 'image' ? (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-primary">
                      <Upload className="w-3.5 h-3.5" />
                      {mediaFile ? mediaFile.name : 'Selecionar arquivo'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => setMediaFile(e.target.files?.[0] ?? null)} />
                    </label>
                    <p className="text-[10px] text-muted-foreground">ou URL:</p>
                    <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                    <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="YouTube / Vimeo URL" className="h-8 text-xs" />
                  </div>
                )}
                <Input value={mediaCaption} onChange={e => setMediaCaption(e.target.value)} placeholder="Legenda (opcional)" className="h-8 text-xs" />
                <Button size="sm" variant="outline" onClick={handleAddMedia} disabled={uploadingMedia} className="w-full h-8 text-xs">
                  {uploadingMedia ? 'Enviando...' : '+ Adicionar mídia'}
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()} className="flex-1">
              {saving ? 'Salvando...' : process ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Criar process-catalog-shell.tsx** (accordion por setor)

```tsx
// squados/src/features/processes/components/process-catalog-shell.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { deleteCatalogProcessAction } from '../actions/catalog-actions';
import { ProcessDetailModal } from './process-detail-modal';
import { ProcessFormModal } from './process-form-modal';
import type { ProcessCatalogFull, Sector } from '@/shared/types/database';

const COLOR_MAP: Record<string, { border: string; bg: string; text: string }> = {
  violet: { border: 'border-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300' },
  blue:   { border: 'border-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-700 dark:text-blue-300' },
  emerald:{ border: 'border-emerald-500',bg: 'bg-emerald-500/10',text: 'text-emerald-700 dark:text-emerald-300' },
  amber:  { border: 'border-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-700 dark:text-amber-300' },
  rose:   { border: 'border-rose-500',   bg: 'bg-rose-500/10',   text: 'text-rose-700 dark:text-rose-300' },
  slate:  { border: 'border-slate-500',  bg: 'bg-slate-500/10',  text: 'text-slate-700 dark:text-slate-300' },
};

interface ProcessCatalogShellProps {
  initialProcesses: ProcessCatalogFull[];
  sectors: Sector[];
  isAdmin: boolean;
}

export function ProcessCatalogShell({ initialProcesses, sectors, isAdmin }: ProcessCatalogShellProps) {
  const [processes, setProcesses] = useState(initialProcesses);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set(['__none__']));
  const [detailProcess, setDetailProcess] = useState<ProcessCatalogFull | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<ProcessCatalogFull | null>(null);

  // Agrupar por setor
  const sectors_with_processes = sectors
    .filter(s => processes.some(p => p.sector_id === s.id))
    .map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      processes: processes.filter(p => p.sector_id === s.id),
    }));

  const unsectored = processes.filter(p => !p.sector_id);

  function toggleSector(id: string) {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Excluir este processo do catálogo?')) return;
    const res = await deleteCatalogProcessAction(id);
    if (res.error) { toast.error(res.error); return; }
    setProcesses(prev => prev.filter(p => p.id !== id));
    toast.success('Processo excluído');
  }

  function ProcessButton({ p }: { p: ProcessCatalogFull }) {
    const c = COLOR_MAP[p.color] ?? COLOR_MAP.violet;
    return (
      <div className="relative group">
        <button
          onClick={() => setDetailProcess(p)}
          className={`w-full text-left px-4 py-3 rounded-lg border-2 ${c.border} ${c.bg} hover:opacity-90 transition-opacity`}
        >
          <span className={`text-sm font-semibold ${c.text}`}>{p.title}</span>
          {p.media.length > 0 && (
            <span className="block text-[10px] text-muted-foreground mt-0.5">
              {p.media.length} mídia{p.media.length > 1 ? 's' : ''}
            </span>
          )}
        </button>
        {isAdmin && (
          <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setEditingProcess(p); setFormOpen(true); }}
              className="p-1 rounded bg-background border border-border shadow-sm hover:bg-muted"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleDelete(p.id, e)}
              className="p-1 rounded bg-background border border-border shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  function SectorAccordion({ id, name, icon, items }: { id: string; name: string; icon: string | null; items: ProcessCatalogFull[] }) {
    const expanded = expandedSectors.has(id);
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSector(id)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            {icon && <span>{icon}</span>}
            <span className="font-semibold text-sm">{name}</span>
            <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expanded && (
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {items.map(p => <ProcessButton key={p.id} p={p} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Processos da Fábrica</h1>
        {isAdmin && (
          <Button onClick={() => { setEditingProcess(null); setFormOpen(true); }} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> Novo Processo
          </Button>
        )}
      </div>

      {sectors_with_processes.length === 0 && unsectored.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">Nenhum processo cadastrado</p>
          {isAdmin && <p className="text-sm mt-1">Clique em "+ Novo Processo" para começar</p>}
        </div>
      )}

      <div className="space-y-3">
        {sectors_with_processes.map(s => (
          <SectorAccordion key={s.id} id={s.id} name={s.name} icon={s.icon} items={s.processes} />
        ))}
        {unsectored.length > 0 && (
          <SectorAccordion id="__none__" name="Sem setor" icon={null} items={unsectored} />
        )}
      </div>

      <ProcessDetailModal
        process={detailProcess}
        open={!!detailProcess}
        onClose={() => setDetailProcess(null)}
      />

      <ProcessFormModal
        open={formOpen}
        process={editingProcess}
        sectors={sectors}
        onClose={() => { setFormOpen(false); setEditingProcess(null); }}
        onSaved={(saved) => {
          setProcesses(prev => {
            const idx = prev.findIndex(p => p.id === saved.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = saved;
              return next;
            }
            return [...prev, saved];
          });
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Criar /processos page**

```tsx
// squados/src/app/(app)/processos/page.tsx
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ProcessCatalogShell } from '@/features/processes/components/process-catalog-shell';
import type { ProcessCatalogFull, ProcessCatalogMedia } from '@/shared/types/database';

export const metadata = { title: 'Processos' };

export default async function ProcessosPage() {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin) redirect('/dashboard');

  const admin = createAdminClient();

  const [catalogResult, sectorsResult] = await Promise.all([
    admin
      .from('process_catalog')
      .select('*, sectors(name, icon), process_catalog_media(*)')
      .eq('is_active', true)
      .order('title'),
    admin
      .from('sectors')
      .select('*')
      .eq('is_active', true)
      .order('name'),
  ]);

  const processes = (catalogResult.data ?? []).map((p) => ({
    ...p,
    sector_name: (p.sectors as { name: string } | null)?.name ?? null,
    sector_icon: (p.sectors as { icon: string } | null)?.icon ?? null,
    media: (p.process_catalog_media ?? []) as ProcessCatalogMedia[],
  })) as ProcessCatalogFull[];

  return (
    <ProcessCatalogShell
      initialProcesses={processes}
      sectors={sectorsResult.data ?? []}
      isAdmin={isAdmin}
    />
  );
}
```

- [ ] **Step 5: Adicionar "Processos" à navegação** em `navigation.ts`

```ts
// Adicionar ClipboardList ao import lucide-react
import { ..., ClipboardList } from 'lucide-react';

// Adicionar após Operações:
{ label: 'Processos', href: '/processos', icon: ClipboardList, minRole: 'admin' },
```

- [ ] **Step 6: Commit**
```bash
git add squados/src/features/processes/ \
        squados/src/app/(app)/processos/ \
        squados/src/config/navigation.ts
git commit -m "feat(processes): aba Processos com catálogo accordion por setor"
```

### Task 11: Picker modal e refactor do ProductionShell

**Files:**
- Create: `squados/src/features/processes/components/process-picker-modal.tsx`
- Modify: `squados/src/features/production/components/production-shell.tsx`
- Modify: `squados/src/app/(app)/producao/page.tsx`
- Modify: `squados/src/app/(app)/producao/usuario/[id]/page.tsx`

- [ ] **Step 1: Criar process-picker-modal.tsx**

```tsx
// squados/src/features/processes/components/process-picker-modal.tsx
'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { ProcessCatalogFull } from '@/shared/types/database';

interface ProcessPickerModalProps {
  open: boolean;
  onClose: () => void;
  catalogProcesses: ProcessCatalogFull[];
  alreadyAssignedIds: string[]; // IDs já no fluxo do usuário
  onConfirm: (selectedIds: string[]) => Promise<void>;
}

export function ProcessPickerModal({
  open, onClose, catalogProcesses, alreadyAssignedIds, onConfirm,
}: ProcessPickerModalProps) {
  const [tab, setTab] = useState<'groups' | 'all'>('groups');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const available = catalogProcesses.filter(p => !alreadyAssignedIds.includes(p.id));

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    return available.filter(p =>
      p.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [available, search]);

  // Agrupar por setor para aba Grupos
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; icon: string | null; processes: ProcessCatalogFull[] }>();
    for (const p of available) {
      const key = p.sector_id ?? '__none__';
      if (!map.has(key)) {
        map.set(key, { name: p.sector_name ?? 'Sem setor', icon: null, processes: [] });
      }
      map.get(key)!.processes.push(p);
    }
    return map;
  }, [available]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroup(sectorKey: string) {
    const group = groups.get(sectorKey);
    if (!group) return;
    const allSelected = group.processes.every(p => selected.has(p.id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        group.processes.forEach(p => next.delete(p.id));
      } else {
        group.processes.forEach(p => next.add(p.id));
      }
      return next;
    });
  }

  function toggleExpand(key: string) {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await onConfirm([...selected]);
      setSelected(new Set());
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Processo ao fluxo</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border -mx-6 px-6">
          <button
            onClick={() => setTab('groups')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'groups' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Grupos
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos (A–Z)
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar processo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 h-9 rounded-md border border-input bg-muted px-3 text-sm"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {tab === 'groups' ? (
            [...groups.entries()].map(([key, group]) => {
              const expanded = expandedSectors.has(key);
              const allGroupSelected = group.processes.every(p => selected.has(p.id));
              const someSelected = group.processes.some(p => selected.has(p.id));
              const visibleProcesses = search.trim()
                ? group.processes.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
                : group.processes;
              if (visibleProcesses.length === 0) return null;

              return (
                <div key={key} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2.5 bg-muted/40">
                    <button
                      onClick={() => toggleExpand(key)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-semibold text-sm">{group.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{visibleProcesses.length}</Badge>
                    </button>
                    <button
                      onClick={() => toggleGroup(key)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        allGroupSelected
                          ? 'bg-primary text-primary-foreground border-transparent'
                          : someSelected
                            ? 'bg-primary/20 border-primary/40 text-primary'
                            : 'border-input hover:bg-muted'
                      }`}
                    >
                      {allGroupSelected ? '✓ Grupo' : '+ Grupo inteiro'}
                    </button>
                  </div>
                  {expanded && (
                    <div className="p-2 space-y-1">
                      {visibleProcesses.map(p => (
                        <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggle(p.id)}
                            className="rounded"
                          />
                          <span className="flex-1">{p.title}</span>
                          {p.media.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">{p.media.length} mídia{p.media.length > 1 ? 's' : ''}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="space-y-1">
              {filtered.length === 0 && (
                <p className="text-center py-8 text-sm text-muted-foreground">Nenhum processo encontrado</p>
              )}
              {filtered.sort((a, b) => a.title.localeCompare(b.title)).map(p => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded hover:bg-muted cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="rounded"
                  />
                  <span className="flex-1">{p.title}</span>
                  {p.sector_name && <span className="text-[10px] text-muted-foreground">{p.sector_name}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 pt-2 border-t border-border mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0 || loading}
            className="flex-1"
          >
            {loading ? 'Adicionando...' : `Adicionar (${selected.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Refatorar ProductionShell para usar AssignedProcess**

O `ProductionShell` tem mudanças significativas. Substituir a interface de props e o estado de processos:

**a) Atualizar imports** — adicionar:
```ts
import type { AssignedProcess, ProcessCatalogFull } from '@/shared/types/database';
import { ProcessDetailModal } from '@/features/processes/components/process-detail-modal';
import { ProcessPickerModal } from '@/features/processes/components/process-picker-modal';
import { addAssignmentsAction, removeAssignmentAction, reorderAssignmentsAction } from '@/features/processes/actions/assignment-actions';
```

**b) Remover imports** que não são mais necessários:
```ts
// REMOVER:
import { createProcessAction, updateProcessAction, deleteProcessAction, reorderProcessesAction, addMediaAction, deleteMediaAction } from '../actions/production-actions';
import type { ProductionProcess, ProductionMedia, ProductionColor } from '@/shared/types/database';
```

**c) Atualizar interface de props** — substituir:
```ts
interface ProductionShellProps {
  initialAssignments: AssignedProcess[];   // em vez de initialProcesses + initialMedia
  initialTasks: ProductionTask[];
  initialCompletions: ProductionTaskCompletion[];
  currentUserId: string;
  targetUserId: string;
  contacts: ContactInfo[];
  isAdmin: boolean;
  showUserGrid?: boolean;
  catalogProcesses: ProcessCatalogFull[];  // para o picker
}
```

**d) Atualizar estado** — substituir os estados de processo:
```ts
const [assignments, setAssignments] = useState<AssignedProcess[]>(initialAssignments);

// Detail modal
const [selectedAssignment, setSelectedAssignment] = useState<AssignedProcess | null>(null);
const [detailOpen, setDetailOpen] = useState(false);

// Picker modal
const [pickerOpen, setPickerOpen] = useState(false);
```

**e) Substituir handlers de processo** — remover `openCreate`, `openEdit`, `handleSaveProcess`, `handleDeleteProcess`, `handleMove`. Adicionar:

```ts
async function handleRemoveAssignment(assignmentId: string, e?: React.MouseEvent) {
  e?.stopPropagation();
  if (!confirm('Remover este processo do fluxo?')) return;
  const res = await removeAssignmentAction(assignmentId);
  if (res.error) { toast.error(res.error); return; }
  setAssignments(prev => prev.filter(a => a.assignment_id !== assignmentId));
  toast.success('Processo removido do fluxo');
}

async function handleMove(assignmentId: string, direction: 'left' | 'right', e?: React.MouseEvent) {
  e?.stopPropagation();
  const idx = assignments.findIndex(a => a.assignment_id === assignmentId);
  if (idx < 0) return;
  const newList = [...assignments];
  const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= newList.length) return;
  [newList[idx], newList[targetIdx]] = [newList[targetIdx], newList[idx]];
  setAssignments(newList);
  await reorderAssignmentsAction(newList.map(a => a.assignment_id));
}

async function handleAddFromPicker(selectedIds: string[]) {
  const res = await addAssignmentsAction(targetUserId, selectedIds);
  if (res.error) { toast.error(res.error); return; }
  // Recarregar assignments com os dados do catálogo
  const newItems = selectedIds.map((id, i) => {
    const cat = catalogProcesses.find(p => p.id === id)!;
    return {
      assignment_id: `temp-${Date.now()}-${i}`,
      catalog_process_id: id,
      order_index: assignments.length + i,
      color: cat.color,
      title: cat.title,
      description: cat.description,
      sector_id: cat.sector_id,
      sector_name: cat.sector_name,
      media: cat.media,
    } as AssignedProcess;
  });
  setAssignments(prev => [...prev, ...newItems]);
  toast.success(`${selectedIds.length} processo(s) adicionado(s)`);
}
```

**f) Substituir ProcessNode** para usar `AssignedProcess`:

```tsx
function ProcessNode({ assignment, index }: { assignment: AssignedProcess; index: number }) {
  const c = COLOR_MAP[assignment.color as ProductionColor] ?? COLOR_MAP.violet;
  return (
    <button
      onClick={() => { setSelectedAssignment(assignment); setDetailOpen(true); }}
      className={`
        group relative flex flex-col items-center gap-2 p-4 rounded-xl border-2
        md:min-w-[150px] md:max-w-[190px] w-full md:w-auto flex-shrink-0
        transition-all duration-200 hover:scale-105 hover:shadow-lg
        ${c.border} ${c.bg}
      `}
    >
      <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center ${c.badge}`}>
        {index + 1}
      </span>
      <span className={`text-sm font-semibold text-center leading-snug ${c.text}`}>
        {assignment.title}
      </span>
      {assignment.sector_name && (
        <span className="text-[10px] text-muted-foreground">{assignment.sector_name}</span>
      )}
      {assignment.media.length > 0 && (
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
          <ImageIcon className="w-3 h-3" />{assignment.media.filter(m => m.type === 'image').length}
          <Video className="w-3 h-3 ml-1" />{assignment.media.filter(m => m.type === 'video').length}
        </span>
      )}

      {isAdmin && (
        <div className="absolute -top-3 right-1 hidden group-hover:flex items-center gap-0.5 z-10">
          <button
            onClick={(e) => handleMove(assignment.assignment_id, 'left', e)}
            disabled={index === 0}
            className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => handleMove(assignment.assignment_id, 'right', e)}
            disabled={index === assignments.length - 1}
            className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => handleRemoveAssignment(assignment.assignment_id, e)}
            className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            title="Remover do fluxo"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </button>
  );
}
```

**g) Atualizar a seção de fluxo no JSX** — substituir o bloco que renderiza processos:

```tsx
{/* Fluxo de processos */}
<div className="space-y-3">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold flex items-center gap-2">
      <Workflow className="w-4 h-4" /> Fluxo de Processos
    </h3>
    {isAdmin && (
      <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="gap-1.5 h-8 text-xs">
        <Plus className="w-3.5 h-3.5" /> Processo
      </Button>
    )}
  </div>

  {assignments.length === 0 ? (
    <div className="flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground">
      {isAdmin ? 'Clique em "+ Processo" para adicionar ao fluxo' : 'Nenhum processo atribuído'}
    </div>
  ) : (
    <div className="flex items-center gap-0 flex-wrap" style={{ rowGap: '12px' }}>
      {assignments.map((a, i) => (
        <Fragment key={a.assignment_id}>
          <ProcessNode assignment={a} index={i} />
          {i < assignments.length - 1 && (
            <div className="flex items-center px-1 text-muted-foreground">
              <ArrowRight className="w-4 h-4" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )}
</div>
```

**h) Adicionar modais no JSX** — no final do retorno (antes do fechamento `</div>`), substituir os modais antigos:

```tsx
{/* Detail modal */}
{selectedAssignment && (
  <ProcessDetailModal
    process={selectedAssignment ? {
      id: selectedAssignment.catalog_process_id,
      sector_id: selectedAssignment.sector_id,
      title: selectedAssignment.title,
      description: selectedAssignment.description,
      color: selectedAssignment.color,
      is_active: true,
      created_by: null,
      created_at: '',
      updated_at: '',
      sector_name: selectedAssignment.sector_name,
      sector_icon: null,
      media: selectedAssignment.media,
    } : null}
    open={detailOpen}
    onClose={() => { setDetailOpen(false); setSelectedAssignment(null); }}
  />
)}

{/* Picker modal */}
<ProcessPickerModal
  open={pickerOpen}
  onClose={() => setPickerOpen(false)}
  catalogProcesses={catalogProcesses}
  alreadyAssignedIds={assignments.map(a => a.catalog_process_id)}
  onConfirm={handleAddFromPicker}
/>
```

- [ ] **Step 3: Atualizar producao/page.tsx para usar getAssignmentsAction**

```tsx
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getMyTasksAction } from '@/features/production/actions/task-actions';
import { getAssignmentsAction } from '@/features/processes/actions/assignment-actions';
import { getCatalogAction } from '@/features/processes/actions/catalog-actions';
import { ProductionShell } from '@/features/production/components/production-shell';

export const metadata = { title: 'Produção' };

export default async function ProducaoPage() {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const [
    { assignments = [] },
    { tasks = [], completions = [] },
    { processes: catalogProcesses = [] },
    contactsResult,
  ] = await Promise.all([
    getAssignmentsAction(),
    getMyTasksAction(),
    isAdmin ? getCatalogAction() : Promise.resolve({ processes: [] }),
    isAdmin
      ? admin.from('profiles').select('id, full_name, avatar_url, role')
          .eq('status', 'active').is('deleted_at', null).neq('id', user.id).order('full_name')
      : Promise.resolve({ data: [] }),
  ]);

  const contacts = (contactsResult.data ?? []) as {
    id: string; full_name: string; avatar_url: string | null; role: string;
  }[];

  return (
    <ProductionShell
      initialAssignments={assignments}
      initialTasks={tasks}
      initialCompletions={completions}
      currentUserId={user.id}
      targetUserId={user.id}
      contacts={contacts}
      isAdmin={isAdmin}
      catalogProcesses={catalogProcesses}
    />
  );
}
```

- [ ] **Step 4: Atualizar producao/usuario/[id]/page.tsx**

```tsx
// No import, adicionar:
import { getAssignmentsAction } from '@/features/processes/actions/assignment-actions';
import { getCatalogAction } from '@/features/processes/actions/catalog-actions';

// No Promise.all, substituir getProductionDataAction por:
const [
  targetProfileResult,
  { tasks = [], completions = [] },
  { assignments = [] },
  { processes: catalogProcesses = [] },
] = await Promise.all([
  admin.from('profiles').select('id, full_name, avatar_url, role, status').eq('id', id).single(),
  getTasksForUserAction(id),
  getAssignmentsAction(id),
  getCatalogAction(),
]);

// No return, atualizar ProductionShell:
<ProductionShell
  initialAssignments={assignments}
  initialTasks={tasks}
  initialCompletions={completions}
  currentUserId={user.id}
  targetUserId={id}
  contacts={[]}
  isAdmin={isAdmin}
  showUserGrid={false}
  catalogProcesses={catalogProcesses}
/>
```

- [ ] **Step 5: Commit final**
```bash
git add squados/src/features/processes/components/process-picker-modal.tsx \
        squados/src/features/production/components/production-shell.tsx \
        squados/src/app/(app)/producao/page.tsx \
        squados/src/app/(app)/producao/usuario/
git commit -m "feat(processes): picker modal + refactor ProductionShell para catálogo"
```

---

## Self-Review

**Spec coverage:**
- ✅ Aba /calendario criada (Task 1)
- ✅ CalendarSection removida da produção (Task 1)
- ✅ Nav item Calendário adicionado (Task 1)
- ✅ attendees JSONB migration (Task 2)
- ✅ Sync Google mapeia attendees (Task 3)
- ✅ create/update aceitam attendees (Task 3)
- ✅ Modal detalhe com X fixo + participantes + todos campos (Task 4)
- ✅ allowed_nav_items migration (Task 5)
- ✅ Sidebar usa getNavItemsForUser (Task 6)
- ✅ AppShell passa allowedNavItems (Task 6)
- ✅ User management UI com checkboxes (Task 7)
- ✅ Actions salvam allowed_nav_items (Task 7)
- ✅ process_catalog + user_process_assignments migration (Task 8)
- ✅ Migração de dados existentes (Task 8)
- ✅ Tipos AssignedProcess + ProcessCatalogFull (Task 9)
- ✅ catalog-actions.ts + assignment-actions.ts (Task 9)
- ✅ Aba /processos accordion por setor (Task 10)
- ✅ ProcessDetailModal + ProcessFormModal (Task 10)
- ✅ Nav item Processos (minRole: admin) (Task 10)
- ✅ ProcessPickerModal com abas Grupos/Todos (Task 11)
- ✅ ProductionShell refatorado (Task 11)
- ✅ producao/page.tsx e usuario/[id] atualizados (Task 11)

**Ordem correta de migrations:** 00023 → 00024 → 00025 (sem conflito com 00022 existente)
