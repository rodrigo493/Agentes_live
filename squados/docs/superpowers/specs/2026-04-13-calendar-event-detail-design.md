# Design Spec — Modal de Detalhe do Evento (Calendário)

**Data:** 2026-04-13  
**Status:** Aprovado  
**Escopo:** Calendário — melhorias no modal de visualização de eventos

---

## Contexto

O modal de detalhe atual mostra título, data/hora, descrição, localização, link e lembrete. Faltam participantes, o botão X do shadcn sobrepõe os botões de editar/excluir, e a experiência é menos rica do que o Google Calendar.

---

## Problemas identificados

| Problema | Causa | Solução |
|---------|-------|---------|
| X sobrepõe botões de ação | shadcn injeta close button em `absolute top-4 right-4` | Suprimir o X padrão via `[&>button]:hidden` no DialogContent e implementar X manual na extrema direita do header |
| Participantes não exibidos | Campo `attendees` não existe na tabela nem no tipo | Adicionar `attendees JSONB` na migration e no tipo |
| Sync não importa participantes | `syncFromGoogleAction` não mapeia `ge.attendees` | Mapear durante o upsert |
| Formulário não tem participantes | `createCalendarEventAction` não aceita attendees | Adicionar campo opcional de participantes no form |

---

## Banco de Dados

```sql
ALTER TABLE calendar_events
ADD COLUMN attendees JSONB NOT NULL DEFAULT '[]';
```

**Estrutura do array `attendees`:**
```json
[
  {
    "email": "joao@empresa.com",
    "name": "João Silva",
    "response": "accepted",
    "organizer": true
  },
  {
    "email": "maria@empresa.com",
    "name": "Maria Costa",
    "response": "needsAction",
    "organizer": false
  }
]
```

**Valores de `response`:** `"accepted"` | `"declined"` | `"tentative"` | `"needsAction"`

---

## Sync Google Calendar

Em `syncFromGoogleAction` (`calendar-actions.ts`), adicionar mapeamento de `ge.attendees`:

```ts
attendees: (ge.attendees ?? []).map((a) => ({
  email: a.email ?? '',
  name: a.displayName ?? a.email ?? '',
  response: a.responseStatus ?? 'needsAction',
  organizer: a.organizer ?? false,
})),
```

Tanto no `update` quanto no `insert` do upsert.

---

## Modal de Detalhe — novo layout

### Header (banda colorida)
```
[Ícone] Título do Evento                    [✏️] [🗑️] [✕]
         Seg, 14 de abril · 10:00 – 11:00
```
- X na extrema direita, depois da lixeira, com margem suficiente
- Implementado como botão manual (suprimir o X padrão do shadcn)
- Ícone de lápis e lixeira mantidos onde estão

### Corpo (em ordem, só aparece se tiver dado)

| Campo | Ícone | Comportamento |
|-------|-------|--------------|
| Descrição | `FileText` | Texto simples, `whitespace-pre-wrap` |
| Local | `MapPin` | Texto. Se começar com `http`, vira link abrindo nova aba |
| Link da reunião | `Link2` + texto "Entrar na reunião" | `<a target="_blank">`, negrito, cor primária |
| Participantes | `Users` | Lista abaixo do título da seção (ver abaixo) |
| Lembrete | `Bell` | "X min antes" |
| Badge Google | — | Aparece se `google_event_id` preenchido |

### Seção de Participantes

```
👥 Participantes (3)
   ● João Silva (organizador)     ✅ Confirmado
   ● Maria Costa                  ❓ Aguardando
   ● Pedro Alves                  ❌ Recusou
```

- Ícone de status: ✅ accepted · ❌ declined · 🔸 tentative · ❓ needsAction
- Organizador exibe badge "(organizador)"
- Se sem participantes, seção não aparece

### Tamanho do modal

Ampliar de `max-w-sm` para `max-w-md` para acomodar a lista de participantes confortavelmente.

---

## Formulário Criar/Editar — campo de participantes

Novo campo **opcional** no form de criar/editar evento:

- Label: "Participantes (emails, separados por vírgula)"
- Input de texto livre com emails separados por vírgula
- Ao salvar: parsear emails, criar array `attendees` com `response: 'needsAction'`
- Ao editar evento do Google: campo preenchido com emails dos participantes (editável)
- Ao criar evento e Google conectado: enviar `attendees` para a API do Google também

---

## Componentes a modificar

| Arquivo | Mudança |
|---------|---------|
| `squados/supabase/migrations/00027_calendar_attendees.sql` | `ALTER TABLE calendar_events ADD COLUMN attendees JSONB DEFAULT '[]'` |
| `src/shared/types/database.ts` | Adicionar `attendees: CalendarAttendee[]` ao `CalendarEvent` + tipo `CalendarAttendee` |
| `src/features/calendar/actions/calendar-actions.ts` | Mapear `ge.attendees` no sync; aceitar `attendees` no create/update |
| `src/features/calendar/components/calendar-section.tsx` | Reposicionar X; expandir modal; exibir todos os campos; adicionar campo de participantes no form |

---

## Fora de escopo

- Enviar convites por email para participantes externos
- Aceitar/recusar convites de dentro do SquadOS
- Sincronização reversa de resposta de participantes para o Google
