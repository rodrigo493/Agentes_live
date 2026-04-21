# Pesquisas Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar aba "Pesquisas" no SquadOS com listagem de cards das pesquisas estratégicas diárias, drawer para leitura completa, e suporte ao campo `category` no ingest-meeting.

**Architecture:** Adicionar `category` ao ingest-meeting API e salvar em `knowledge_docs.category`. Criar Server Component `/pesquisas` que filtra por `category = 'pesquisa_diaria'` e `sector_id = active_sector_id`. Drawer client-side usando `Sheet` do shadcn/base-ui já presente no projeto.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (admin client), Tailwind CSS, shadcn/ui (Sheet, Badge, Card), lucide-react

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/app/api/ingest-meeting/route.ts` | Modificar | Aceitar `category` no body e salvar em `knowledge_docs` |
| `src/config/navigation.ts` | Modificar | Adicionar item "Pesquisas" no nav |
| `src/app/(app)/pesquisas/page.tsx` | Criar | Server Component: busca dados e renderiza grid |
| `src/app/(app)/pesquisas/_components/pesquisas-grid.tsx` | Criar | Client Component: filtros por tema + estado do drawer |
| `src/app/(app)/pesquisas/_components/pesquisa-drawer.tsx` | Criar | Sheet com conteúdo completo da pesquisa |

---

## Task 1: Adicionar `category` no ingest-meeting API

**Files:**
- Modify: `src/app/api/ingest-meeting/route.ts`

- [ ] **Step 1: Atualizar o tipo do body e a lógica de insert**

Substituir as linhas 13-20 e o bloco de insert em `route.ts`:

```typescript
// Linha 13 — novo tipo do body
let body: { sector_slug: string; title: string; content: string; source_file?: string; doc_type?: string; category?: string };

// Linha 20 — nova desestruturação
const { sector_slug, title, content, source_file, doc_type = 'transcript', category } = body;
```

No bloco `.insert({...})` de `knowledge_docs` (por volta da linha 60), adicionar o campo `category`:

```typescript
const { data: doc, error: docError } = await adminClient
  .from('knowledge_docs')
  .insert({
    sector_id: sector.id,
    title,
    content,
    doc_type: finalDocType,
    category: category ?? null,
    uploaded_by: systemUser.id,
    tags: finalDocType === 'transcript'
      ? ['reuniao', 'automatico', sector_slug]
      : ['conhecimento', 'automatico', sector_slug],
    metadata: {
      source: finalDocType === 'transcript' ? 'plaud_autoflow' : 'presidente_brain',
      source_file: source_file ?? null,
      ingested_at: new Date().toISOString(),
    },
  })
  .select('id')
  .single();
```

- [ ] **Step 2: Testar manualmente**

```bash
curl -s -X POST https://squad.liveuni.com.br/api/ingest-meeting \
  -H "Authorization: Bearer live_ingest_2026_reunioes" \
  -H "Content-Type: application/json" \
  -d '{"sector_slug":"presidencia","title":"Teste Pesquisa","content":"conteudo teste","doc_type":"document","category":"pesquisa_diaria"}' | python3 -m json.tool
```

Esperado: `{"success": true, "doc_id": "...", ...}`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ingest-meeting/route.ts
git commit -m "feat: add category field to ingest-meeting API"
```

---

## Task 2: Adicionar "Pesquisas" na navegação

**Files:**
- Modify: `src/config/navigation.ts`

- [ ] **Step 1: Adicionar import do ícone**

No bloco de imports do lucide-react (linha 1-22), adicionar `TrendingUp`:

```typescript
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Building2,
  FolderOpen,
  FileText,
  Brain,
  Shield,
  Users,
  UsersRound,
  Settings,
  BarChart3,
  Mic,
  Eye,
  Factory,
  Mail,
  Workflow,
  CalendarDays,
  ClipboardList,
  BookOpen,
  TrendingUp,
} from 'lucide-react';
```

- [ ] **Step 2: Adicionar item no array NAV_ITEMS**

Após a linha do `Roteiros` (linha 42), adicionar:

```typescript
{ label: 'Pesquisas', href: '/pesquisas', icon: TrendingUp, minRole: 'operator' },
```

- [ ] **Step 3: Commit**

```bash
git add src/config/navigation.ts
git commit -m "feat: add Pesquisas to navigation"
```

---

## Task 3: Criar Drawer de pesquisa

**Files:**
- Create: `src/app/(app)/pesquisas/_components/pesquisa-drawer.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { TEMA_CONFIG } from './tema-config';

export interface Pesquisa {
  id: string;
  title: string;
  content: string;
  created_at: string;
  tema: string;
}

interface PesquisaDrawerProps {
  pesquisa: Pesquisa | null;
  onClose: () => void;
}

export function PesquisaDrawer({ pesquisa, onClose }: PesquisaDrawerProps) {
  const config = pesquisa ? TEMA_CONFIG[pesquisa.tema] ?? TEMA_CONFIG['DEFAULT'] : null;

  return (
    <Sheet open={!!pesquisa} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {pesquisa && config && (
          <>
            <SheetHeader className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={config.badge}>{pesquisa.tema}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(pesquisa.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <SheetTitle className="text-left text-base leading-snug">
                {pesquisa.title}
              </SheetTitle>
            </SheetHeader>
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {pesquisa.content}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/pesquisas/_components/pesquisa-drawer.tsx
git commit -m "feat: add PesquisaDrawer component"
```

---

## Task 4: Criar configuração de temas

**Files:**
- Create: `src/app/(app)/pesquisas/_components/tema-config.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
export interface TemaConfig {
  badge: string;
  pill: string;
  label: string;
}

export const TEMA_CONFIG: Record<string, TemaConfig> = {
  MERCADO: {
    badge: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
    pill: 'bg-blue-100 text-blue-800',
    label: 'Mercado',
  },
  COMPETITIVA: {
    badge: 'bg-red-100 text-red-800 hover:bg-red-100',
    pill: 'bg-red-100 text-red-800',
    label: 'Competitiva',
  },
  TECNICA: {
    badge: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
    pill: 'bg-purple-100 text-purple-800',
    label: 'Técnica / IPS',
  },
  MA: {
    badge: 'bg-green-100 text-green-800 hover:bg-green-100',
    pill: 'bg-green-100 text-green-800',
    label: 'M&A / IPO',
  },
  ESTRATEGIA: {
    badge: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
    pill: 'bg-orange-100 text-orange-800',
    label: 'Estratégia',
  },
  REGULATORIA: {
    badge: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
    pill: 'bg-yellow-100 text-yellow-800',
    label: 'Regulatória',
  },
  EXPANSAO: {
    badge: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-100',
    pill: 'bg-cyan-100 text-cyan-800',
    label: 'Expansão',
  },
  DEFAULT: {
    badge: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
    pill: 'bg-gray-100 text-gray-800',
    label: 'Pesquisa',
  },
};

export const TEMAS = Object.keys(TEMA_CONFIG).filter((k) => k !== 'DEFAULT');

export function extractTema(title: string): string {
  const upper = title.toUpperCase();
  for (const tema of TEMAS) {
    if (upper.includes(tema)) return tema;
  }
  return 'DEFAULT';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/pesquisas/_components/tema-config.ts
git commit -m "feat: add tema config for Pesquisas"
```

---

## Task 5: Criar PesquisasGrid (Client Component)

**Files:**
- Create: `src/app/(app)/pesquisas/_components/pesquisas-grid.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { PesquisaDrawer, type Pesquisa } from './pesquisa-drawer';
import { TEMA_CONFIG, TEMAS, extractTema } from './tema-config';

interface PesquisasGridProps {
  pesquisas: Pesquisa[];
}

export function PesquisasGrid({ pesquisas }: PesquisasGridProps) {
  const [filtroTema, setFiltroTema] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<Pesquisa | null>(null);

  const filtradas = filtroTema
    ? pesquisas.filter((p) => p.tema === filtroTema)
    : pesquisas;

  return (
    <>
      {/* Filtros por tema */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFiltroTema(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filtroTema === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          Todos
        </button>
        {TEMAS.map((tema) => {
          const config = TEMA_CONFIG[tema];
          const count = pesquisas.filter((p) => p.tema === tema).length;
          if (count === 0) return null;
          return (
            <button
              key={tema}
              onClick={() => setFiltroTema(filtroTema === tema ? null : tema)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filtroTema === tema ? config.pill : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid de cards */}
      {filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          Nenhuma pesquisa encontrada.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtradas.map((p) => {
            const config = TEMA_CONFIG[p.tema] ?? TEMA_CONFIG['DEFAULT'];
            return (
              <Card key={p.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Badge className={config.badge}>{config.label}</Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-sm font-medium line-clamp-2 leading-snug">{p.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                    {p.content.replace(/^---[\s\S]*?---\n/, '').slice(0, 200)}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-auto w-full"
                    onClick={() => setSelecionada(p)}
                  >
                    Ler pesquisa
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PesquisaDrawer pesquisa={selecionada} onClose={() => setSelecionada(null)} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/pesquisas/_components/pesquisas-grid.tsx
git commit -m "feat: add PesquisasGrid client component"
```

---

## Task 6: Criar página /pesquisas (Server Component)

**Files:**
- Create: `src/app/(app)/pesquisas/page.tsx`

- [ ] **Step 1: Criar a página**

```typescript
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { TrendingUp } from 'lucide-react';
import { PesquisasGrid } from './_components/pesquisas-grid';
import { extractTema } from './_components/tema-config';

export default async function PesquisasPage() {
  const { profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const query = admin
    .from('knowledge_docs')
    .select('id, title, content, created_at')
    .eq('category', 'pesquisa_diaria')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (profile.active_sector_id) {
    query.eq('sector_id', profile.active_sector_id);
  }

  const { data: docs } = await query;

  const pesquisas = (docs ?? []).map((doc) => ({
    id: doc.id,
    title: doc.title,
    content: doc.content ?? '',
    created_at: doc.created_at,
    tema: extractTema(doc.title),
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pesquisas Estratégicas</h1>
          <p className="text-sm text-muted-foreground">
            {pesquisas.length} pesquisa{pesquisas.length !== 1 ? 's' : ''} · inteligência competitiva diária
          </p>
        </div>
      </div>

      <PesquisasGrid pesquisas={pesquisas} />
    </div>
  );
}
```

- [ ] **Step 2: Verificar que a página carrega no browser**

```
https://squad.liveuni.com.br/pesquisas
```

Esperado: página renderiza com header "Pesquisas Estratégicas" e grid de cards (ou "Nenhuma pesquisa encontrada" se ainda não houver docs com `category = 'pesquisa_diaria'`).

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/pesquisas/
git commit -m "feat: add /pesquisas page with card grid and drawer"
```

---

## Task 7: Atualizar pesquisa-diaria.py na VPS

**Files:**
- Modify: `/opt/rodrigo-brain/pesquisa-diaria.py` (VPS)

- [ ] **Step 1: Adicionar `category` no payload do `publicar()`**

Na função `publicar()` do script, o dict `payload` deve ficar:

```python
payload = {
    "sector_slug": "presidencia",
    "title": titulo,
    "content": conteudo,
    "doc_type": "document",
    "category": "pesquisa_diaria",
    "source_file": "pesquisa-diaria.py"
}
```

- [ ] **Step 2: Deploy via base64 na VPS**

No Windows local, gerar o base64 do arquivo atualizado:

```bash
python3 -c "import base64; print(base64.b64encode(open('c:/projetos/Rodrigo_Brain/Rodrigo_Brain/pesquisa-diaria-vps.py','rb').read()).decode())"
```

Na VPS:
```bash
python3 -c "import base64; open('/opt/rodrigo-brain/pesquisa-diaria.py','wb').write(base64.b64decode('<BASE64_AQUI>'))"
```

- [ ] **Step 3: Testar execução**

```bash
python3 /opt/rodrigo-brain/pesquisa-diaria.py && tail -10 /opt/rodrigo-brain/pesquisa-diaria.log
```

Esperado: `SquadOS OK: doc_id=...` e `WhatsApp OK`

- [ ] **Step 4: Verificar no SquadOS**

Acessar `/pesquisas` e confirmar que o novo documento aparece com badge do tema correto.

---

## Task 8: Deploy na VPS do SquadOS

- [ ] **Step 1: Push para GitHub**

```bash
cd C:\VS_CODE\Agentes_live\squados
git push origin main
```

- [ ] **Step 2: Build e deploy na VPS**

```bash
# Na VPS
cd /opt/squad/squados
git pull origin main
docker build -t s3:latest .
docker service update --image s3:latest squad_squad
```

- [ ] **Step 3: Verificar deploy**

```bash
docker service ps squad_squad | head -5
```

Esperado: `Running` na coluna CURRENT STATE.

- [ ] **Step 4: Teste final**

Acessar `https://squad.liveuni.com.br/pesquisas` e confirmar:
- [ ] Sidebar mostra "Pesquisas" com ícone TrendingUp
- [ ] Grid de cards aparece com badges coloridos por tema
- [ ] Filtros por tema funcionam
- [ ] Drawer abre ao clicar "Ler pesquisa"
- [ ] Conteúdo completo aparece no drawer
