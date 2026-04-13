# Design Spec — Aba "Calendário" dedicada

**Data:** 2026-04-13  
**Status:** Aprovado  
**Escopo:** Mover CalendarSection da produção para rota própria

---

## Contexto

O calendário hoje vive dentro do `ProductionShell` como uma seção colapsável. A separação em aba própria deixa a tela de Produção focada em processos e tarefas, e dá ao calendário um espaço dedicado acessível diretamente.

---

## Decisões de Design

| Questão | Decisão |
|---------|---------|
| Rota | `/calendario` |
| Posição na nav | Logo após "Produção" |
| `minRole` | `viewer` — todos os usuários |
| Padrão em `allowed_nav_items` | Incluído — `/calendario` faz parte do conjunto padrão junto com `/workspace`, `/email`, `/chat` |
| Escopo dos dados | Calendário do usuário logado (igual ao comportamento atual) |
| Mudança no componente `CalendarSection` | Nenhuma — recebe as mesmas props |

---

## Navegação

```ts
// navigation.ts — nova entrada após Produção
{ label: 'Calendário', href: '/calendario', icon: CalendarDays, minRole: 'viewer' }
```

---

## Nova página `/calendario`

Server component que busca os dados necessários para o `CalendarSection`:

```ts
// src/app/(app)/calendario/page.tsx
export default async function CalendarioPage() {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Fetch calendar events
  const { data: events } = await admin
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .order('start_at');

  // Fetch Google connection status
  const { data: token } = await admin
    .from('google_calendar_tokens')
    .select('google_email, calendar_id')
    .eq('user_id', user.id)
    .maybeSingle();

  // Check if Google OAuth is configured
  const googleConfigured = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  return (
    <CalendarSection
      currentUserId={user.id}
      initialCalendarEvents={events ?? []}
      googleConnected={!!token}
      googleEmail={token?.google_email}
      googleConfigured={googleConfigured}
    />
  );
}
```

---

## Remoção do calendário da Produção

### `production-shell.tsx`
- Remover import de `CalendarSection`
- Remover prop `showCalendar`, `initialCalendarEvents`, `googleConnected`, `googleEmail`, `googleConfigured`
- Remover o bloco de renderização do `CalendarSection`

### `src/app/(app)/producao/page.tsx`
- Remover fetch de `calendar_events` e `google_calendar_tokens`
- Remover props de calendário passadas ao `ProductionShell`

### `src/app/(app)/producao/usuario/[id]/page.tsx`
- Idem — remover fetch e props de calendário

---

## Componentes a criar/modificar

| Arquivo | Ação |
|---------|------|
| `src/app/(app)/calendario/page.tsx` | Criar — server component |
| `src/config/navigation.ts` | Adicionar item "Calendário" com `CalendarDays` icon |
| `src/features/production/components/production-shell.tsx` | Remover CalendarSection e props relacionadas |
| `src/app/(app)/producao/page.tsx` | Remover fetches e props de calendário |
| `src/app/(app)/producao/usuario/[id]/page.tsx` | Remover fetches e props de calendário |

---

## Fora de escopo

- Mudanças no comportamento do CalendarSection
- Calendário compartilhado entre usuários
- Visão de calendário de outros usuários pelo admin
