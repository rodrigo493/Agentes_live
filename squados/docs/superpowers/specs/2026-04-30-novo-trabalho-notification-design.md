# Design — Notificação "Novo Trabalho"

**Data:** 2026-04-30  
**Status:** Aprovado  
**Projeto:** SquadOS — Operações / Workflows

---

## Contexto

Quando um usuário recebe um novo card em seu fluxo de trabalho (via `workflow_inbox_items` INSERT), o sistema deve exibir uma notificação visual e sonora imediata em qualquer página do app. A notificação persiste até o usuário clicar em "Ver agora".

---

## Requisitos

| # | Requisito |
|---|---|
| R1 | Notificação aparece em **todas as páginas** do app (global) |
| R2 | Trigger: INSERT na tabela `workflow_inbox_items` com `user_id = usuário logado` |
| R3 | Detecção via **Supabase Realtime** (instantâneo, sem delay de polling) |
| R4 | Som toca ao aparecer: 3 beeps curtos (880Hz → 1046Hz → 880Hz, 0.15s cada) |
| R5 | Banner permanece até o usuário clicar **"Ver agora"** (dismiss manual) |
| R6 | Múltiplos cards em fila: exibe o primeiro, ao dispensar mostra o próximo |
| R7 | Clicar "Ver agora" navega para `/operations/card/[stepId]` |

---

## Arquitetura

### Artefatos novos

```
src/features/notifications/
├── hooks/
│   └── use-work-notification.ts       # Realtime subscription + estado da fila
└── components/
    └── work-notification-banner.tsx   # Visual da targa
```

### Modificação existente

```
src/shared/components/layout/app-shell.tsx   # Renderiza o banner globalmente
```

---

## Fluxo de dados

```
1. App carrega
   └── use-work-notification() abre canal Realtime:
       tabela: workflow_inbox_items
       evento: INSERT
       filtro: user_id = auth.uid()

2. INSERT chega
   └── item adicionado à fila: { title, reference, step_id, instance_id }
   └── Som toca: 3 beeps Web Audio API

3. Banner renderiza
   └── position: fixed, top: 48px, left: 0, right: 0, z-index: 9999
   └── Exibe: título do step + referência do card

4. Usuário clica "Ver agora"
   └── Navega para /operations/card/[stepId]
   └── Remove item da fila → próximo item exibe (se houver)

5. Fila vazia → banner desmonta
```

---

## Visual

### Especificação CSS

| Propriedade | Valor |
|---|---|
| Fundo | `#0a0a0a` |
| Altura | `52px` |
| Posição | `fixed`, `top: 48px` (abaixo do header), `left: 0`, `right: 0` |
| z-index | `9999` |
| Borda | `border-top` + `border-bottom`: `2px solid #ff6b00` animado |
| Glow externo | `box-shadow: 0 -8px 20px rgba(255,107,0,0.55), 0 0 20px rgba(255,220,0,0.25)` |
| Animação borda | `blink-orange` 0.7s ease-in-out infinite alternate |
| Texto "NOVO TRABALHO" | `color: #ffe600`, `text-shadow` glow amarelo, `font-weight: 700`, `text-transform: uppercase` |
| Tag "⚡ Operações" | `color: #ff8c00`, `font-size: 0.6rem`, uppercase |
| Ícone | Pulsante, fundo `#1a1000` |
| Botão "Ver agora" | Borda `#333`, cor `#666`, hover sutil |

### Animações

```css
@keyframes blink-orange {
  0%   { border-color: #ff6b00; box-shadow: /* glow forte */; }
  100% { border-color: rgba(255,107,0,0.12); box-shadow: /* glow fraco */; }
}

@keyframes flicker {
  0%, 90%, 100% { opacity: 1; }
  92%           { opacity: 0.85; }
  94%           { opacity: 1; }
  96%           { opacity: 0.9; }
}
```

---

## Som

Web Audio API — 3 beeps curtos ao montar o banner:

```
Beep 1: 880Hz,  0.15s, gain 0.3
Beep 2: 1046Hz, 0.15s, gain 0.3  (após 0.2s)
Beep 3: 880Hz,  0.15s, gain 0.3  (após 0.4s)
```

Sem dependência de arquivo de áudio externo. Funciona mesmo sem permissão de notificação do SO.

---

## Hook `use-work-notification`

```typescript
interface WorkNotification {
  step_id: string
  instance_id: string
  title: string
  reference: string
}

// Estado: fila de notificações pendentes
// Expõe: notification (atual) | null, dismiss()
// Efeito: abre canal Realtime, fecha no cleanup
// Toca som: quando notification muda de null para item
```

---

## Integração no AppShell

O `WorkNotificationBanner` é renderizado dentro do `app-shell.tsx` logo após o `<header>`, acima do conteúdo principal. Usa o hook internamente. Quando `notification === null`, retorna `null` (sem render).

---

## Fora do escopo

- Histórico de notificações dispensadas
- Configuração de volume ou desativar som
- Notificações fora da categoria `workflow_inbox_items` (ex: chat, e-mail)
