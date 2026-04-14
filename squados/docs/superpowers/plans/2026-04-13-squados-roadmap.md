# SquadOS Roadmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 4 fases em ordem de prioridade: Produção (Realtime + Web Push), Roteiros (orquestrador + RAG), Voz (Whisper fallback) e Workflows (CSV, timeline, reatribuição, comentários, cards).

**Architecture:** Cada fase é independente e deployável separadamente. Fase 1 instala `web-push` e cria service worker PWA. Fase 2 é só migration + SQL query. Fase 3 modifica a route `/api/stt`. Fase 4 instala `recharts` e cria/modifica componentes de workflows.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS + Realtime), Tailwind, shadcn/ui, TypeScript, `web-push`, `recharts`.

---

## File Map

```
CRIAR:
  squados/public/sw.js
  squados/src/app/api/push/subscribe/route.ts
  squados/src/app/api/push/unsubscribe/route.ts
  squados/src/shared/lib/push/web-push.ts
  squados/src/features/settings/components/push-notification-toggle.tsx
  squados/supabase/migrations/00032_push_subscriptions.sql
  squados/supabase/migrations/00033_orquestrador_agent.sql
  squados/supabase/migrations/00034_step_reassignments.sql
  squados/supabase/migrations/00035_step_comments.sql
  squados/src/features/workflows/actions/reassign-actions.ts
  squados/src/features/workflows/actions/comment-actions.ts
  squados/src/features/workflows/components/reassign-step-modal.tsx
  squados/src/features/workflows/components/step-comments.tsx
  squados/src/features/workflows/components/overdue-timeline-chart.tsx
  squados/src/app/api/admin/embed-procedures/route.ts

MODIFICAR:
  squados/src/features/workflows/components/workflow-inbox.tsx
  squados/src/features/workflows/actions/warning-actions.ts
  squados/src/features/workflows/components/overdue-dashboard.tsx
  squados/src/features/workflows/components/block-analytics.tsx
  squados/src/features/workflows/components/workflow-shell.tsx
  squados/src/features/workflows/components/template-editor-modal.tsx
  squados/src/features/workflows/actions/analytics-actions.ts
  squados/src/app/api/stt/route.ts
  squados/src/shared/types/database.ts
```

---

## FASE 1 — Produção

### Task 1: Realtime na Caixa de Entrada

**Files:**
- Modify: `squados/src/features/workflows/components/workflow-inbox.tsx`

- [ ] **Step 1: Substituir setInterval por Supabase Realtime**

Abrir `src/features/workflows/components/workflow-inbox.tsx`. Substituir o `useEffect` inteiro (linha ~37-44) por:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertOctagon, Clock, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/shared/lib/supabase/client';
import { getMyInboxAction } from '../actions/inbox-actions';
import { completeStepAction, blockStepAction, listBlockReasonsAction } from '../actions/instance-actions';
import type { WorkflowInboxItem, WorkflowBlockReason } from '@/shared/types/database';

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function overdue(item: WorkflowInboxItem) {
  return item.status !== 'done' && new Date(item.due_at).getTime() < Date.now();
}

export function WorkflowInbox() {
  const [items, setItems] = useState<WorkflowInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<WorkflowBlockReason[]>([]);
  const [blockItem, setBlockItem] = useState<WorkflowInboxItem | null>(null);
  const [blockCode, setBlockCode] = useState('');
  const [blockText, setBlockText] = useState('');

  async function load() {
    const r = await getMyInboxAction();
    if (r.items) setItems(r.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    listBlockReasonsAction().then((r) => r.reasons && setReasons(r.reasons));

    const supabase = createClient();

    const channel = supabase
      .channel('workflow-inbox-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workflow_inbox_items' },
        () => { load(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);
  // ... resto do componente inalterado
```

- [ ] **Step 2: Verificar se `createClient` (browser) existe**

```bash
ls squados/src/shared/lib/supabase/
```

Deve existir `client.ts`. Se não existir, criar:

```ts
// squados/src/shared/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/workflow-inbox.tsx
git add squados/src/shared/lib/supabase/client.ts
git commit -m "feat(inbox): Supabase Realtime substitui polling de 30s"
```

---

### Task 2: Migration — tabela push_subscriptions

**Files:**
- Create: `squados/supabase/migrations/00032_push_subscriptions.sql`

- [ ] **Step 1: Criar migration**

```sql
-- squados/supabase/migrations/00032_push_subscriptions.sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_sub_own ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY push_sub_admin_read ON push_subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
```

- [ ] **Step 2: Aplicar no Supabase**

```bash
cd squados && npx supabase db push
```

Saída esperada: `Applying migration 00032_push_subscriptions.sql... done`

- [ ] **Step 3: Adicionar tipo ao database.ts**

Em `squados/src/shared/types/database.ts`, adicionar ao final da seção de interfaces:

```ts
export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add squados/supabase/migrations/00032_push_subscriptions.sql squados/src/shared/types/database.ts
git commit -m "feat(push): migration push_subscriptions + tipo TS"
```

---

### Task 3: Instalar web-push e gerar VAPID keys

**Files:**
- Modify: `squados/.env.local`

- [ ] **Step 1: Instalar web-push**

```bash
cd squados && npm install web-push @types/web-push
```

- [ ] **Step 2: Gerar VAPID keys**

```bash
cd squados && npx web-push generate-vapid-keys
```

Saída esperada:
```
Public Key: BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX
Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 3: Adicionar variáveis ao .env.local**

```env
VAPID_EMAIL=mailto:admin@liveuni.com.br
VAPID_PUBLIC_KEY=<cole a public key gerada>
VAPID_PRIVATE_KEY=<cole a private key gerada>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<mesma public key>
```

- [ ] **Step 4: Commit (sem commitar o .env)**

```bash
git add squados/package.json squados/package-lock.json
git commit -m "feat(push): instalar web-push"
```

---

### Task 4: Service Worker e helper web-push

**Files:**
- Create: `squados/public/sw.js`
- Create: `squados/src/shared/lib/push/web-push.ts`

- [ ] **Step 1: Criar service worker**

```js
// squados/public/sw.js
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'SquadOS', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const found = cs.find((c) => c.url.includes(url) && 'focus' in c);
      if (found) return found.focus();
      return clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: Criar helper server-side**

```ts
// squados/src/shared/lib/push/web-push.ts
import webpush from 'web-push';

let configured = false;

function configure() {
  if (configured) return;
  const email = process.env.VAPID_EMAIL;
  const pub   = process.env.VAPID_PUBLIC_KEY;
  const priv  = process.env.VAPID_PRIVATE_KEY;
  if (!email || !pub || !priv) return;
  webpush.setVapidDetails(email, pub, priv);
  configured = true;
}

export async function sendPushNotification(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  configure();
  await webpush.sendNotification(
    { endpoint, keys: { p256dh, auth } },
    JSON.stringify(payload),
    { TTL: 60 }
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add squados/public/sw.js squados/src/shared/lib/push/web-push.ts
git commit -m "feat(push): service worker + helper web-push"
```

---

### Task 5: API routes de subscribe/unsubscribe

**Files:**
- Create: `squados/src/app/api/push/subscribe/route.ts`
- Create: `squados/src/app/api/push/unsubscribe/route.ts`

- [ ] **Step 1: Criar route de subscribe**

```ts
// squados/src/app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    const body = await req.json() as { endpoint: string; keys: { p256dh: string; auth: string } };

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('push_subscriptions').upsert(
      {
        user_id:  user.id,
        endpoint: body.endpoint,
        p256dh:   body.keys.p256dh,
        auth:     body.keys.auth,
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
}
```

- [ ] **Step 2: Criar route de unsubscribe**

```ts
// squados/src/app/api/push/unsubscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    const body = await req.json() as { endpoint: string };

    const admin = createAdminClient();
    await admin.from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', body.endpoint);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add squados/src/app/api/push/
git commit -m "feat(push): API routes subscribe/unsubscribe"
```

---

### Task 6: Componente toggle de notificações push

**Files:**
- Create: `squados/src/features/settings/components/push-notification-toggle.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// squados/src/features/settings/components/push-notification-toggle.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function PushNotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setSupported(true);

    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    });
  }, []);

  async function handleToggle() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (subscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
        toast.success('Notificações desativadas');
      } else {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        const json = sub.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json),
        });
        setSubscribed(true);
        toast.success('Notificações ativadas!');
      }
    } catch (e) {
      toast.error('Erro ao configurar notificações: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  return (
    <Button
      variant={subscribed ? 'default' : 'outline'}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      className="gap-2"
    >
      {subscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
      {subscribed ? 'Notificações ativas' : 'Ativar notificações'}
    </Button>
  );
}
```

- [ ] **Step 2: Adicionar o toggle na página de settings**

Abrir `squados/src/app/(app)/settings/page.tsx` (ou o componente de settings existente) e importar + renderizar `<PushNotificationToggle />` na seção de preferências do usuário.

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/settings/components/push-notification-toggle.tsx
git add squados/src/app/(app)/settings/
git commit -m "feat(push): toggle de notificações push nas configurações"
```

---

### Task 7: Disparar Web Push ao enviar advertência

**Files:**
- Modify: `squados/src/features/workflows/actions/warning-actions.ts`

- [ ] **Step 1: Modificar sendWarningAction para disparar push**

Abrir `squados/src/features/workflows/actions/warning-actions.ts`. Modificar a função `sendWarningAction`:

```ts
'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { sendPushNotification } from '@/shared/lib/push/web-push';

export interface WorkflowWarning {
  id: string;
  workflow_step_id: string | null;
  instance_id: string | null;
  sent_by: string;
  sent_to: string;
  reason: string;
  message: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export async function sendWarningAction(
  stepId: string,
  reason: string,
  message?: string
): Promise<{ warning_id?: string; error?: string }> {
  await getAuthenticatedUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('send_workflow_warning', {
    p_step_id: stepId,
    p_reason:  reason.trim(),
    p_message: message?.trim() || null,
  });
  if (error) return { error: error.message };

  // Disparar Web Push para todos os master_admin
  try {
    const admin = createAdminClient();
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in(
        'user_id',
        (await admin
          .from('profiles')
          .select('id')
          .eq('role', 'master_admin')
          .then((r) => (r.data ?? []).map((p) => p.id)))
      );

    if (subs && subs.length > 0) {
      await Promise.allSettled(
        subs.map((s) =>
          sendPushNotification(s.endpoint, s.p256dh, s.auth, {
            title: '⚠️ Advertência enviada',
            body: `Motivo: ${reason}${message ? ' — ' + message : ''}`,
            url: '/operacoes',
          })
        )
      );
    }
  } catch {
    // Push é melhor-esforço; não bloqueia o retorno
  }

  return { warning_id: data as string };
}

// acknowledgeWarningAction e listMyWarningsAction permanecem inalterados
export async function acknowledgeWarningAction(id: string): Promise<{ error?: string }> {
  await getAuthenticatedUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc('acknowledge_workflow_warning', { p_warning_id: id });
  if (error) return { error: error.message };
  return {};
}

export async function listMyWarningsAction(): Promise<{
  warnings?: WorkflowWarning[];
  error?: string;
}> {
  const { user } = await getAuthenticatedUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workflow_warnings')
    .select('*')
    .eq('sent_to', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { error: error.message };
  return { warnings: (data ?? []) as WorkflowWarning[] };
}
```

- [ ] **Step 2: Commit**

```bash
git add squados/src/features/workflows/actions/warning-actions.ts
git commit -m "feat(push): disparar Web Push ao enviar advertência"
```

---

## FASE 2 — Roteiros

### Task 8: Migration — agente orquestrador

**Files:**
- Create: `squados/supabase/migrations/00033_orquestrador_agent.sql`

- [ ] **Step 1: Criar migration**

```sql
-- squados/supabase/migrations/00033_orquestrador_agent.sql
-- Garante existência do agente orquestrador (referenciado pelas funções de workflow)
INSERT INTO agents (
  name,
  display_name,
  type,
  access_level,
  context_policy,
  description,
  config,
  sector_id
)
VALUES (
  'orquestrador',
  'Orquestrador',
  'executive',
  'global',
  'global_executive',
  'Agente orquestrador de workflows — recebe notificações de etapas, atrasos e advertências.',
  '{}'::jsonb,
  NULL
)
ON CONFLICT (name) DO NOTHING;
```

> Atenção: verifique se a tabela `agents` tem coluna `name` com constraint UNIQUE. Se não tiver, usar:
> `ON CONFLICT DO NOTHING` substituído por `WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'orquestrador')`.

- [ ] **Step 2: Aplicar migration**

```bash
cd squados && npx supabase db push
```

- [ ] **Step 3: Verificar no Supabase Dashboard**

```sql
SELECT id, name, display_name, type FROM agents WHERE name = 'orquestrador';
```

Deve retornar 1 linha.

- [ ] **Step 4: Commit**

```bash
git add squados/supabase/migrations/00033_orquestrador_agent.sql
git commit -m "feat(roteiros): migration insere agente orquestrador"
```

---

### Task 9: Verificar pipeline RAG para procedures

**Files:**
- Create (se necessário): `squados/src/app/api/admin/embed-procedures/route.ts`

- [ ] **Step 1: Verificar se embeddings existem**

No Supabase SQL Editor, rodar:

```sql
SELECT
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS com_embedding,
  COUNT(*) FILTER (WHERE embedding IS NULL)     AS sem_embedding
FROM knowledge_docs
WHERE doc_type = 'procedure';
```

- **Se `com_embedding > 0`:** pipeline RAG já funciona. Pular para o Step 4.
- **Se `sem_embedding > 0` e `com_embedding = 0`:** criar o job de embedding (Step 2).

- [ ] **Step 2 (condicional): Criar route de embedding manual**

```ts
// squados/src/app/api/admin/embed-procedures/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getAuthenticatedUser();
    if (profile.role !== 'master_admin') {
      return NextResponse.json({ error: 'Apenas master_admin' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: docs, error } = await admin
    .from('knowledge_docs')
    .select('id, content')
    .eq('doc_type', 'procedure')
    .is('embedding', null)
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!docs || docs.length === 0) return NextResponse.json({ embedded: 0 });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 500 });

  let embedded = 0;
  for (const doc of docs) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: doc.content.slice(0, 8000) }),
      });
      const json = await res.json() as { data: Array<{ embedding: number[] }> };
      const vector = json.data?.[0]?.embedding;
      if (!vector) continue;

      await admin
        .from('knowledge_docs')
        .update({ embedding: JSON.stringify(vector) })
        .eq('id', doc.id);

      embedded++;
    } catch {
      // continua para o próximo
    }
  }

  return NextResponse.json({ embedded, total: docs.length });
}
```

- [ ] **Step 3 (condicional): Rodar embedding manual**

```bash
curl -X POST https://squad.liveuni.com.br/api/admin/embed-procedures \
  -H "Cookie: <session-cookie-do-master_admin>"
```

Ou chamar via fetch no browser estando logado como master_admin.

- [ ] **Step 4: Commit**

```bash
git add squados/src/app/api/admin/embed-procedures/route.ts
git commit -m "feat(roteiros): route para gerar embeddings de procedures manualmente"
```

---

## FASE 3 — Voz

### Task 10: Fallback Whisper na route STT

**Files:**
- Modify: `squados/src/app/api/stt/route.ts`

- [ ] **Step 1: Adicionar OPENAI_API_KEY ao .env.local**

```env
OPENAI_API_KEY=sk-...
```

- [ ] **Step 2: Substituir a route STT com fallback**

```ts
// squados/src/app/api/stt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';

export const runtime = 'nodejs';

async function transcribeElevenLabs(file: File, apiKey: string): Promise<string | null> {
  const form = new FormData();
  form.append('file', file, file.name || 'audio.webm');
  form.append('model_id', 'scribe_v1');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = (data.text ?? data.transcription ?? '').toString().trim();
  return text.length >= 3 ? text : null;
}

async function transcribeWhisper(file: File, apiKey: string): Promise<string | null> {
  const form = new FormData();
  form.append('file', file, file.name || 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = (data.text ?? '').toString().trim();
  return text.length >= 3 ? text : null;
}

export async function POST(req: NextRequest) {
  try {
    await getAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY não configurada' }, { status: 500 });
  }

  const incoming = await req.formData();
  const file = incoming.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file obrigatório' }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Áudio acima de 25MB' }, { status: 400 });
  }

  // Tentar ElevenLabs primeiro
  let text = await transcribeElevenLabs(file, elevenKey);

  // Fallback: Whisper
  if (!text) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      text = await transcribeWhisper(file, openaiKey);
    }
  }

  if (!text) {
    return NextResponse.json({ error: 'Não foi possível transcrever o áudio' }, { status: 422 });
  }

  return NextResponse.json({ text });
}
```

- [ ] **Step 3: Testar localmente**

Iniciar o dev server e fazer um teste de voz no chat do agente. Verificar nos logs se o ElevenLabs responde corretamente.

```bash
cd squados && npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add squados/src/app/api/stt/route.ts
git commit -m "feat(voz): fallback OpenAI Whisper quando ElevenLabs retorna vazio"
```

---

### Task 11: Deploy na VPS e testes mobile

**Files:** nenhum

- [ ] **Step 1: Push para o repositório**

```bash
git push origin main
```

- [ ] **Step 2: Na VPS, atualizar e rebuildar**

```bash
ssh <user>@squad.liveuni.com.br
cd /opt/squad
git pull origin main
docker service update --force squad_squad
```

- [ ] **Step 3: Confirmar envs na VPS**

```bash
docker service inspect squad_squad --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}'
```

Verificar se `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` e `OPENAI_API_KEY` estão presentes.

Se faltarem:

```bash
docker service update \
  --env-add ELEVENLABS_API_KEY=sua_chave \
  --env-add ELEVENLABS_VOICE_ID=seu_voice_id \
  --env-add OPENAI_API_KEY=sk-... \
  squad_squad
```

- [ ] **Step 4: Testar iOS Safari**

Abrir `https://squad.liveuni.com.br` no iPhone → chat de agente → botão de microfone. Deve gravar em `audio/mp4` e transcrever.

- [ ] **Step 5: Testar Android Chrome**

Abrir no Android → mesmo fluxo. Deve gravar em `audio/webm` e transcrever.

---

## FASE 4 — Workflows

### Task 12: Export CSV — Overdue Dashboard

**Files:**
- Modify: `squados/src/features/workflows/components/overdue-dashboard.tsx`

- [ ] **Step 1: Adicionar função exportToCsv e botão**

No `overdue-dashboard.tsx`, após a declaração de `items`, adicionar a função e o botão:

```tsx
function exportOverdueCsv(items: Item[]) {
  const header = ['Etapa', 'Referência', 'Responsável', 'Prazo', 'Horas de Atraso', 'Status'];
  const rows = items.map((it) => [
    `"${it.title}"`,
    `"${it.reference}"`,
    `"${it.assignee_name ?? ''}"`,
    `"${new Date(it.due_at).toLocaleString('pt-BR')}"`,
    String(it.hours_overdue.toFixed(1)),
    `"${it.status}"`,
  ]);
  const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `atrasos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

No JSX, antes do `<div className="space-y-2">` que renderiza os itens, adicionar:

```tsx
<div className="flex justify-end mb-2">
  <Button size="sm" variant="outline" onClick={() => exportOverdueCsv(items)} className="gap-1">
    <Download className="w-3.5 h-3.5" /> Exportar CSV
  </Button>
</div>
```

Adicionar `Download` nos imports do lucide-react.

- [ ] **Step 2: Commit**

```bash
git add squados/src/features/workflows/components/overdue-dashboard.tsx
git commit -m "feat(workflows): export CSV no dashboard de atrasos"
```

---

### Task 13: Export CSV — Block Analytics

**Files:**
- Modify: `squados/src/features/workflows/components/block-analytics.tsx`

- [ ] **Step 1: Adicionar exportação no block-analytics**

Em `block-analytics.tsx`, adicionar após o `useEffect`:

```tsx
function exportAnalyticsCsv(rows: BlockAnalyticsRow[]) {
  const header = ['Código', 'Motivo', 'Categoria', 'Setor', 'Ocorrências', 'Média Horas Bloqueado'];
  const data = rows.map((r) => [
    `"${r.code}"`,
    `"${r.label}"`,
    `"${r.category}"`,
    `"${r.sector_name ?? 'Todos'}"`,
    String(r.occurrences),
    String(r.avg_hours_blocked?.toFixed(1) ?? ''),
  ]);
  const csv = [header.join(','), ...data.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-bloqueios-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Adicionar botão no topo do JSX retornado (antes do primeiro `div` de conteúdo):

```tsx
<div className="flex justify-end mb-3">
  <Button size="sm" variant="outline" onClick={() => exportAnalyticsCsv(rows)} className="gap-1">
    <Download className="w-3.5 h-3.5" /> Exportar CSV
  </Button>
</div>
```

Adicionar `Download` e `Button` nos imports.

- [ ] **Step 2: Commit**

```bash
git add squados/src/features/workflows/components/block-analytics.tsx
git commit -m "feat(workflows): export CSV no analytics de bloqueios"
```

---

### Task 14: Gráfico temporal de atrasos

**Files:**
- Modify: `squados/src/features/workflows/actions/analytics-actions.ts`
- Create: `squados/src/features/workflows/components/overdue-timeline-chart.tsx`
- Modify: `squados/src/features/workflows/components/workflow-shell.tsx`

- [ ] **Step 1: Instalar recharts**

```bash
cd squados && npm install recharts
```

- [ ] **Step 2: Adicionar action de timeline**

Em `analytics-actions.ts`, adicionar ao final:

```ts
export interface OverdueByWeek {
  week: string;       // 'YYYY-WW'
  week_label: string; // '10/04 – 16/04'
  count: number;
}

export async function getOverdueByWeekAction(): Promise<{
  rows?: OverdueByWeek[];
  error?: string;
}> {
  try {
    await requireAdmin();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('workflow_steps')
      .select('due_at, status')
      .in('status', ['in_progress', 'blocked', 'done'])
      .not('due_at', 'is', null)
      .gte('due_at', new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('due_at');

    if (error) return { error: error.message };

    const byWeek: Record<string, { count: number; start: Date }> = {};

    for (const s of data ?? []) {
      const d = new Date(s.due_at!);
      const isLate = d.getTime() < Date.now() || s.status === 'done';
      if (!isLate) continue;

      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const key = monday.toISOString().slice(0, 10);

      if (!byWeek[key]) byWeek[key] = { count: 0, start: monday };
      byWeek[key].count++;
    }

    const rows: OverdueByWeek[] = Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { count, start }]) => {
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        return { week: key, week_label: `${fmt(start)}–${fmt(end)}`, count };
      });

    return { rows };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
```

- [ ] **Step 3: Criar componente do gráfico**

```tsx
// squados/src/features/workflows/components/overdue-timeline-chart.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getOverdueByWeekAction, type OverdueByWeek } from '../actions/analytics-actions';

export function OverdueTimelineChart() {
  const [rows, setRows] = useState<OverdueByWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOverdueByWeekAction().then((r) => {
      if (r.rows) setRows(r.rows);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>;
  if (rows.length === 0) return <div className="text-sm text-muted-foreground py-6 text-center">Sem dados de atraso nas últimas 12 semanas.</div>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Etapas em atraso por semana (últimas 12 semanas)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="week_label"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(v: number) => [v, 'Etapas atrasadas']}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Adicionar chart na view analytics do workflow-shell**

Em `workflow-shell.tsx`, na seção `{view === 'analytics' && <BlockAnalytics />}`, substituir por:

```tsx
{view === 'analytics' && (
  <div className="space-y-6">
    <OverdueTimelineChart />
    <BlockAnalytics />
  </div>
)}
```

Adicionar o import: `import { OverdueTimelineChart } from './overdue-timeline-chart';`

- [ ] **Step 5: Commit**

```bash
git add squados/src/features/workflows/actions/analytics-actions.ts
git add squados/src/features/workflows/components/overdue-timeline-chart.tsx
git add squados/src/features/workflows/components/workflow-shell.tsx
git add squados/package.json squados/package-lock.json
git commit -m "feat(workflows): gráfico temporal de atrasos por semana"
```

---

### Task 15: Migration — step_reassignments e step_comments

**Files:**
- Create: `squados/supabase/migrations/00034_step_reassignments.sql`
- Create: `squados/supabase/migrations/00035_step_comments.sql`

- [ ] **Step 1: Criar migration de reatribuição**

```sql
-- squados/supabase/migrations/00034_step_reassignments.sql
CREATE TABLE IF NOT EXISTS step_reassignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id        UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  from_user_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  to_user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reassigned_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reassigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE step_reassignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY step_reassign_read ON step_reassignments
  FOR SELECT USING (
    reassigned_by = auth.uid()
    OR to_user_id = auth.uid()
    OR from_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

CREATE POLICY step_reassign_insert ON step_reassignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );
```

- [ ] **Step 2: Criar migration de comentários**

```sql
-- squados/supabase/migrations/00035_step_comments.sql
CREATE TABLE IF NOT EXISTS step_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id    UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE step_comments ENABLE ROW LEVEL SECURITY;

-- Todos que têm acesso à instância podem ler os comentários
CREATE POLICY step_comments_read ON step_comments
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workflow_steps ws
      JOIN workflow_instances wi ON wi.id = ws.instance_id
      WHERE ws.id = step_comments.step_id
        AND (ws.assignee_id = auth.uid() OR wi.started_by = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','master_admin'))
  );

-- Só o responsável atual da etapa pode inserir
CREATE POLICY step_comments_insert ON step_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM workflow_steps WHERE id = step_comments.step_id AND assignee_id = auth.uid()
    )
  );
```

- [ ] **Step 3: Aplicar migrations**

```bash
cd squados && npx supabase db push
```

- [ ] **Step 4: Adicionar tipos ao database.ts**

Em `squados/src/shared/types/database.ts`:

```ts
export interface StepReassignment {
  id: string;
  step_id: string;
  from_user_id: string | null;
  to_user_id: string;
  reassigned_by: string;
  reassigned_at: string;
}

export interface StepComment {
  id: string;
  step_id: string;
  user_id: string;
  body: string;
  created_at: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add squados/supabase/migrations/00034_step_reassignments.sql
git add squados/supabase/migrations/00035_step_comments.sql
git add squados/src/shared/types/database.ts
git commit -m "feat(workflows): migrations step_reassignments + step_comments"
```

---

### Task 16: Server actions — reatribuição

**Files:**
- Create: `squados/src/features/workflows/actions/reassign-actions.ts`

- [ ] **Step 1: Criar arquivo de actions**

```ts
// squados/src/features/workflows/actions/reassign-actions.ts
'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { StepReassignment } from '@/shared/types/database';

async function requireAdmin() {
  const { profile } = await getAuthenticatedUser();
  if (profile.role !== 'admin' && profile.role !== 'master_admin') {
    throw new Error('Apenas admin ou Presidente');
  }
  return profile;
}

export async function reassignStepAction(
  stepId: string,
  toUserId: string
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const profile = await requireAdmin();

  const { data: step, error: stepErr } = await admin
    .from('workflow_steps')
    .select('id, assignee_id, status')
    .eq('id', stepId)
    .single();

  if (stepErr || !step) return { error: 'Etapa não encontrada' };
  if (!['in_progress', 'blocked'].includes(step.status)) {
    return { error: 'Só é possível reatribuir etapas em andamento ou bloqueadas' };
  }

  // Inserir registro de auditoria
  const { error: auditErr } = await admin.from('step_reassignments').insert({
    step_id:       stepId,
    from_user_id:  step.assignee_id,
    to_user_id:    toUserId,
    reassigned_by: profile.id,
  });
  if (auditErr) return { error: auditErr.message };

  // Atualizar assignee_id na etapa
  const { error: updateErr } = await admin
    .from('workflow_steps')
    .update({ assignee_id: toUserId })
    .eq('id', stepId);

  if (updateErr) return { error: updateErr.message };
  return {};
}

export async function listStepReassignmentsAction(stepId: string): Promise<{
  reassignments?: (StepReassignment & {
    from_user_name: string | null;
    to_user_name: string;
    reassigned_by_name: string;
  })[];
  error?: string;
}> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('step_reassignments')
    .select(`
      *,
      from_user:profiles!step_reassignments_from_user_id_fkey(full_name),
      to_user:profiles!step_reassignments_to_user_id_fkey(full_name),
      reassigned_by_user:profiles!step_reassignments_reassigned_by_fkey(full_name)
    `)
    .eq('step_id', stepId)
    .order('reassigned_at', { ascending: false });

  if (error) return { error: error.message };

  const reassignments = (data ?? []).map((r) => ({
    ...r,
    from_user_name: (r.from_user as { full_name: string } | null)?.full_name ?? null,
    to_user_name: (r.to_user as { full_name: string }).full_name,
    reassigned_by_name: (r.reassigned_by_user as { full_name: string }).full_name,
  }));

  return { reassignments };
}
```

- [ ] **Step 2: Commit**

```bash
git add squados/src/features/workflows/actions/reassign-actions.ts
git commit -m "feat(workflows): server actions de reatribuição com auditoria"
```

---

### Task 17: Server actions — comentários

**Files:**
- Create: `squados/src/features/workflows/actions/comment-actions.ts`

- [ ] **Step 1: Criar arquivo de actions**

```ts
// squados/src/features/workflows/actions/comment-actions.ts
'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import type { StepComment } from '@/shared/types/database';

export async function addStepCommentAction(
  stepId: string,
  body: string
): Promise<{ comment?: StepComment; error?: string }> {
  const { user } = await getAuthenticatedUser();
  const supabase = await createClient();

  // Verificar que o usuário é o responsável atual
  const admin = createAdminClient();
  const { data: step } = await admin
    .from('workflow_steps')
    .select('assignee_id')
    .eq('id', stepId)
    .single();

  if (!step || step.assignee_id !== user.id) {
    return { error: 'Apenas o responsável atual pode comentar nesta etapa' };
  }

  const { data, error } = await supabase
    .from('step_comments')
    .insert({ step_id: stepId, user_id: user.id, body: body.trim() })
    .select()
    .single();

  if (error) return { error: error.message };
  return { comment: data as StepComment };
}

export async function listStepCommentsAction(stepId: string): Promise<{
  comments?: (StepComment & { user_name: string })[];
  error?: string;
}> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('step_comments')
    .select('*, user:profiles!step_comments_user_id_fkey(full_name)')
    .eq('step_id', stepId)
    .order('created_at');

  if (error) return { error: error.message };

  const comments = (data ?? []).map((c) => ({
    ...c,
    user_name: (c.user as { full_name: string }).full_name,
  }));

  return { comments };
}
```

- [ ] **Step 2: Commit**

```bash
git add squados/src/features/workflows/actions/comment-actions.ts
git commit -m "feat(workflows): server actions de comentários de etapa"
```

---

### Task 18: Modal de reatribuição

**Files:**
- Create: `squados/src/features/workflows/components/reassign-step-modal.tsx`

- [ ] **Step 1: Criar o modal**

```tsx
// squados/src/features/workflows/components/reassign-step-modal.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { UserCheck, Clock } from 'lucide-react';
import { reassignStepAction, listStepReassignmentsAction } from '../actions/reassign-actions';
import type { Profile } from '@/shared/types/database';

interface Props {
  stepId: string;
  stepTitle: string;
  currentAssigneeId: string | null;
  users: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  open: boolean;
  onClose: () => void;
  onReassigned: (newUserId: string) => void;
}

type Reassignment = {
  id: string;
  from_user_name: string | null;
  to_user_name: string;
  reassigned_by_name: string;
  reassigned_at: string;
};

export function ReassignStepModal({
  stepId, stepTitle, currentAssigneeId, users, open, onClose, onReassigned,
}: Props) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Reassignment[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  async function loadHistory() {
    if (historyLoaded) return;
    const r = await listStepReassignmentsAction(stepId);
    if (r.reassignments) setHistory(r.reassignments as Reassignment[]);
    setHistoryLoaded(true);
  }

  async function handleReassign() {
    if (!selectedUserId) return;
    setSaving(true);
    const r = await reassignStepAction(stepId, selectedUserId);
    setSaving(false);
    if (r.error) return toast.error(r.error);
    toast.success('Etapa reatribuída com sucesso');
    onReassigned(selectedUserId);
    onClose();
  }

  const otherUsers = users.filter((u) => u.id !== currentAssigneeId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else loadHistory(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" /> Reatribuir etapa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Etapa: <span className="font-medium text-foreground">{stepTitle}</span>
          </p>

          <div>
            <Label>Novo responsável</Label>
            <select
              className="w-full h-9 text-sm rounded-md border border-input bg-background px-2 mt-1"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">— selecione —</option>
              {otherUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleReassign} disabled={!selectedUserId || saving}>
              {saving ? 'Salvando…' : 'Confirmar reatribuição'}
            </Button>
          </div>

          {history.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico</p>
              {history.map((h) => (
                <div key={h.id} className="text-xs text-muted-foreground flex items-start gap-2">
                  <Clock className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    <span className="text-foreground font-medium">{h.reassigned_by_name}</span> reatribuiu de{' '}
                    <Badge variant="outline" className="text-[10px]">{h.from_user_name ?? 'ninguém'}</Badge>{' '}
                    para <Badge variant="outline" className="text-[10px]">{h.to_user_name}</Badge>{' '}
                    em {new Date(h.reassigned_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add squados/src/features/workflows/components/reassign-step-modal.tsx
git commit -m "feat(workflows): modal de reatribuição com histórico de auditoria"
```

---

### Task 19: Componente de comentários da etapa

**Files:**
- Create: `squados/src/features/workflows/components/step-comments.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// squados/src/features/workflows/components/step-comments.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { addStepCommentAction, listStepCommentsAction } from '../actions/comment-actions';

interface Props {
  stepId: string;
  isAssignee: boolean; // true se o usuário atual é o responsável da etapa
}

type Comment = { id: string; body: string; user_name: string; created_at: string };

export function StepComments({ stepId, isAssignee }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listStepCommentsAction(stepId).then((r) => {
      if (r.comments) setComments(r.comments as Comment[]);
    });
  }, [stepId]);

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    const r = await addStepCommentAction(stepId, body);
    setSending(false);
    if (r.error) return toast.error(r.error);
    if (r.comment) {
      setComments((prev) => [...prev, { ...r.comment!, user_name: 'Você' }]);
      setBody('');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <MessageSquare className="w-3.5 h-3.5" /> Comentários
      </div>

      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
      )}

      {comments.map((c) => (
        <div key={c.id} className="text-sm border rounded-md p-2 bg-muted/20">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-xs">{c.user_name}</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(c.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs">{c.body}</p>
        </div>
      ))}

      {isAssignee && (
        <div className="flex gap-2">
          <Textarea
            rows={2}
            placeholder="Adicionar comentário…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="text-sm"
          />
          <Button size="sm" onClick={handleSend} disabled={sending || !body.trim()} className="self-end">
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrar o componente no detalhe da etapa**

Identificar onde as etapas em andamento são exibidas no detalhe (provavelmente em `workflow-inbox.tsx` ou em um modal de instância). Adicionar:

```tsx
import { StepComments } from './step-comments';

// Dentro do card/modal de detalhe da etapa, após os botões:
<div className="mt-3 border-t pt-3">
  <StepComments stepId={item.workflow_step_id} isAssignee={true} />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add squados/src/features/workflows/components/step-comments.tsx
git commit -m "feat(workflows): componente de comentários de etapa"
```

---

### Task 20: Cards visuais melhorados no editor de template

**Files:**
- Modify: `squados/src/features/workflows/components/template-editor-modal.tsx`

- [ ] **Step 1: Melhorar o card de preview das etapas**

Localizar o bloco que renderiza o preview horizontal das etapas (aproximadamente linha 190-210 no arquivo atual). O trecho atual:

```tsx
<div className="px-2 py-1 rounded border bg-background text-[10px] text-center min-w-[90px]">
  <div className="font-semibold truncate">{s.title || '(sem título)'}</div>
  <div className="text-muted-foreground truncate">{label}</div>
  <div className="text-muted-foreground">{s.sla_hours}h</div>
</div>
```

Substituir por:

```tsx
<div className="px-2 py-1.5 rounded border bg-background text-[10px] min-w-[100px] space-y-0.5">
  <div className="font-semibold truncate flex items-center gap-1">
    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
    {s.title || '(sem título)'}
  </div>
  <div className="flex items-center gap-1 text-muted-foreground">
    <span className="truncate">{label}</span>
  </div>
  <div className="flex items-center gap-1 text-muted-foreground">
    <Clock className="w-2.5 h-2.5 shrink-0" />
    <span>SLA: {s.sla_hours}h</span>
  </div>
</div>
```

Adicionar `Clock` nos imports do lucide-react (já pode existir — verificar antes de adicionar).

- [ ] **Step 2: Commit**

```bash
git add squados/src/features/workflows/components/template-editor-modal.tsx
git commit -m "feat(workflows): cards de etapa com indicador de SLA e responsável"
```

---

## Self-Review Checklist

### Spec coverage

| Requisito | Task |
|-----------|------|
| Realtime inbox | Task 1 |
| Web Push Presidente | Tasks 2-7 |
| Chat orquestrador ao enviar advertência | Task 7 (via RPC existente + verificado em 00027/00029) |
| Agente orquestrador na tabela | Task 8 |
| Validar/criar pipeline RAG | Task 9 |
| Fallback Whisper | Task 10 |
| Deploy VPS + testes mobile | Task 11 |
| Export CSV atrasos | Task 12 |
| Export CSV analytics | Task 13 |
| Gráfico temporal | Task 14 |
| Reatribuição com auditoria | Tasks 15-18 |
| Comentários só pelo responsável | Tasks 15, 17, 19 |
| Cards visuais melhorados | Task 20 |

### Notas importantes

- **Chat do orquestrador** já acontece via `send_workflow_warning` (SQL function em `00029`) — não precisa de código adicional. O que precisava era garantir que o agente existe (`Task 8`).
- **Task 1 (Realtime)**: o `createClient` do browser pode não existir — verificar o Step 2 antes de assumir.
- **Task 9 (RAG)**: é condicional. Se embeddings já existem, a route de embed não precisa ser deployada.
- **Task 15 migration 00034**: verificar se `workflow_steps` tem a FK `workflow_steps_assignee_id_fkey` com esse nome exato antes de usar em join do Task 16.
