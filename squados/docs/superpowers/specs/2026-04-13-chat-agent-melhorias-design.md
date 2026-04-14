# Chat Agente — Melhorias Design

> Spec aprovado pelo usuário em 2026-04-13.

## Goal

Três melhorias independentes no chat do agente e na gestão de usuários.

---

## Feature A — Voz no Chat do Agente

**Arquivo:** `src/features/chat-agent/components/agent-chat-shell.tsx`

**Comportamento:**
- Adicionar botão de microfone ao lado do botão Send no input area
- Usar o hook `useVoiceChat` existente em `src/features/chat-agent/hooks/use-voice-chat.ts`
- Estado `lastInputWasVoice: boolean` — seta `true` ao enviar via mic, `false` ao enviar via teclado/Enter
- Quando resposta do agente chega e `lastInputWasVoice === true` → chamar `voice.speak(agentMsg.content)` automaticamente
- Botão mic mostra estado: Mic (idle) → MicOff (gravando) → Loader2 (transcrevendo)
- Ao enviar por voz, `lastInputWasVoice = true`; ao enviar por texto, `lastInputWasVoice = false`

---

## Feature B — Imagens no Conhecimento

**Comportamento:**
- No formulário de ingestão de documentos em `sector-management.tsx`: adicionar campo de upload de imagens (JPG/PNG/WEBP, múltiplas)
- Migration: adicionar coluna `image_urls text[]` em `knowledge_docs` com default `'{}'`
- Imagens sobem para Supabase Storage no bucket `knowledge-images`, path `{sector_id}/{doc_id}/{filename}`
- Em `generateAgentResponse` (`agent-ai.ts`): quando doc relevante tem `image_urls`, incluir URLs no system prompt com instrução explícita de sempre inserir as imagens na resposta usando marcador `[IMAGE:url]`
- System prompt instrução: "Sempre que sua resposta se basear em um documento que contém imagens, insira TODAS as imagens desse documento na resposta usando o formato exato: [IMAGE:https://url-da-imagem]. Faça isso mesmo que o usuário não tenha pedido a imagem."
- Em `agent-chat-shell.tsx`: ao renderizar mensagem do agente, parsear `[IMAGE:url]` e substituir por `<img src={url} className="rounded-lg max-w-full mt-2" />`

**Migration:** `00036_knowledge_image_urls.sql`

**Bucket Supabase:** `knowledge-images` (public read, authenticated write)

---

## Feature C — Layout SectorCheckboxList

**Arquivo:** `src/features/users/components/sector-checkbox-list.tsx`

**Mudanças:**
- Grid: `grid-cols-2 sm:grid-cols-3` (remover `lg:grid-cols-4`)
- Container: `w-full overflow-hidden`
- Cada `label`: `w-full min-h-[60px] items-start`
- Texto do nome: manter `break-words`

---

## Tech Stack

- Next.js 15 App Router, TypeScript, Supabase Storage, Claude vision (image_url blocks), shadcn/ui
- Hook `useVoiceChat` já existente (sem dependências novas para Feature A)
- Supabase Storage para Feature B
