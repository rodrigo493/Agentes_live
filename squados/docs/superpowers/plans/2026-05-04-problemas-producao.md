# Problemas de Produção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o módulo "Problemas de Produção" no SquadOS — recebe problemas do CRM Live via webhook, exibe KPI cards para o CEO, permite encaminhar para usuários do Squad com solução, e exportar para PDF/Excel.

**Architecture:** Webhook API route insere em duas tabelas Supabase (`production_problems`, `problem_assignments`). A página `/problemas-producao` é um server component que passa dados para um client shell. O CEO vê todos os problemas; outros usuários veem apenas os encaminhados para eles, filtrado pela server action.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript, Tailwind CSS, shadcn/ui, jsPDF + jspdf-autotable (PDF), xlsx/SheetJS (Excel)

---

## Task 1: Migration — Criar tabelas production_problems e problem_assignments

**Files:**
- Create: `supabase/migrations/00067_production_problems.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- Migration 00067: Production Problems — módulo KPI de problemas recebidos do CRM Live

-- ── Tabela principal de problemas ────────────────────────────
CREATE TABLE IF NOT EXISTS production_problems (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  description  TEXT        NOT NULL,
  client_name  TEXT        NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL,
  crm_payload  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_problems_received
  ON production_problems(received_at DESC);

-- ── Tabela de encaminhamentos ────────────────────────────────
CREATE TABLE IF NOT EXISTS problem_assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id        UUID        NOT NULL REFERENCES production_problems(id) ON DELETE CASCADE,
  assigned_user_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  solution          TEXT,
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_problem_assignments_problem
  ON problem_assignments(problem_id);

CREATE INDEX IF NOT EXISTS idx_problem_assignments_user
  ON problem_assignments(assigned_user_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE production_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos autenticados leem production_problems"
  ON production_problems FOR SELECT
  USING (auth.role() = 'authenticated');

ALTER TABLE problem_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário lê seus encaminhamentos ou admin lê todos"
  ON problem_assignments FOR SELECT
  USING (
    assigned_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'master_admin')
    )
  );
-- Escrita somente pelo service role (RLS não bloqueia service role)
```

- [ ] **Step 2: Aplicar migration**

```bash
cd squados
npx supabase db push
```

Saída esperada: `Applying migration 00067_production_problems.sql... done`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00067_production_problems.sql
git commit -m "feat(db): tabelas production_problems e problem_assignments"
```

---

## Task 2: Webhook API Route

**Files:**
- Create: `src/app/api/problemas-producao/webhook/route.ts`

- [ ] **Step 1: Criar a route**

```typescript
// src/app/api/problemas-producao/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

const SECRET = process.env.PROBLEMAS_WEBHOOK_SECRET;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret') ?? '';
  if (!SECRET || secret !== SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { description, client_name, received_at } = body as {
    description?: string;
    client_name?: string;
    received_at?: string;
  };

  if (!description?.trim()) return json({ error: 'description é obrigatório' }, 400);
  if (!client_name?.trim()) return json({ error: 'client_name é obrigatório' }, 400);
  if (!received_at) return json({ error: 'received_at é obrigatório' }, 400);

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('production_problems')
    .insert({
      description: description.trim(),
      client_name: client_name.trim(),
      received_at,
      crm_payload: body,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[problemas webhook] insert error:', error?.message);
    return json({ error: 'Erro interno ao salvar problema' }, 500);
  }

  console.info('[problemas webhook] criado', { id: data.id, client_name });
  return json({ id: data.id }, 201);
}
```

- [ ] **Step 2: Adicionar variável de ambiente**

Adicionar no `.env.local`:
```
PROBLEMAS_WEBHOOK_SECRET=squad-problemas-webhook-2026
```

E no ambiente de produção (VPS / Supabase env), configurar a mesma variável.

- [ ] **Step 3: Testar o endpoint**

```bash
curl -X POST http://localhost:3000/api/problemas-producao/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: squad-problemas-webhook-2026" \
  -d '{"description":"Equipamento V12 com defeito na mola","client_name":"Studio Pilates Centro","received_at":"2026-05-04T10:00:00Z"}'
```

Saída esperada: `{"id":"<uuid>"}` com status 201.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/problemas-producao/webhook/route.ts
git commit -m "feat(api): webhook POST /api/problemas-producao/webhook"
```

---

## Task 3: Server Actions

**Files:**
- Create: `src/features/problemas-producao/actions/problemas-actions.ts`

- [ ] **Step 1: Criar o arquivo de actions**

```typescript
// src/features/problemas-producao/actions/problemas-actions.ts
'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export interface ProductionProblem {
  id: string;
  description: string;
  client_name: string;
  received_at: string;
  created_at: string;
  assignments: ProblemAssignment[];
}

export interface ProblemAssignment {
  id: string;
  assigned_user_id: string;
  assigned_user_name: string;
  assigned_by: string;
  solution: string | null;
  assigned_at: string;
}

export interface SquadUser {
  id: string;
  full_name: string;
  sector_name: string | null;
}

export async function getProblems(): Promise<{
  problems?: ProductionProblem[];
  isAdmin?: boolean;
  error?: string;
}> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();

  const { data: assignmentsRaw, error: aErr } = await admin
    .from('problem_assignments')
    .select('id, problem_id, assigned_user_id, assigned_by, solution, assigned_at, profiles!problem_assignments_assigned_user_id_fkey(full_name)');

  if (aErr) {
    console.error('[getProblems] assignments error:', aErr.message);
    return { error: 'Erro ao carregar encaminhamentos' };
  }

  let query = admin
    .from('production_problems')
    .select('id, description, client_name, received_at, created_at')
    .order('received_at', { ascending: false });

  // Não-admin: filtra apenas problemas encaminhados para o usuário
  if (!isAdmin) {
    const myProblemIds = (assignmentsRaw ?? [])
      .filter((a) => a.assigned_user_id === user.id)
      .map((a) => a.problem_id);

    if (myProblemIds.length === 0) {
      return { problems: [], isAdmin };
    }
    query = query.in('id', myProblemIds);
  }

  const { data: problems, error: pErr } = await query;

  if (pErr) {
    console.error('[getProblems] problems error:', pErr.message);
    return { error: 'Erro ao carregar problemas' };
  }

  // Busca nomes dos assigners (CEO)
  const assignerIds = [...new Set((assignmentsRaw ?? []).map((a) => a.assigned_by))];
  const { data: assigners } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', assignerIds.length > 0 ? assignerIds : ['00000000-0000-0000-0000-000000000000']);

  const assignerMap = Object.fromEntries((assigners ?? []).map((p) => [p.id, p.full_name]));

  const assignmentsByProblem: Record<string, ProblemAssignment[]> = {};
  for (const a of assignmentsRaw ?? []) {
    if (!assignmentsByProblem[a.problem_id]) assignmentsByProblem[a.problem_id] = [];
    const profiles = a.profiles as { full_name: string } | { full_name: string }[] | null;
    const userName = Array.isArray(profiles)
      ? (profiles[0]?.full_name ?? 'Usuário')
      : (profiles?.full_name ?? 'Usuário');
    assignmentsByProblem[a.problem_id].push({
      id: a.id,
      assigned_user_id: a.assigned_user_id,
      assigned_user_name: userName,
      assigned_by: assignerMap[a.assigned_by] ?? 'CEO',
      solution: a.solution,
      assigned_at: a.assigned_at,
    });
  }

  const result: ProductionProblem[] = (problems ?? []).map((p) => ({
    ...p,
    assignments: assignmentsByProblem[p.id] ?? [],
  }));

  return { problems: result, isAdmin };
}

export async function assignProblem(
  problemId: string,
  userIds: string[],
  solution: string
): Promise<{ success?: boolean; error?: string }> {
  const { user, profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  if (!isAdmin) return { error: 'Apenas admins podem encaminhar problemas' };
  if (!userIds.length) return { error: 'Selecione ao menos um usuário' };

  const admin = createAdminClient();

  // Remove assignments anteriores deste problema para recriar
  await admin.from('problem_assignments').delete().eq('problem_id', problemId);

  const rows = userIds.map((uid) => ({
    problem_id: problemId,
    assigned_user_id: uid,
    assigned_by: user.id,
    solution: solution.trim() || null,
  }));

  const { error } = await admin.from('problem_assignments').insert(rows);

  if (error) {
    console.error('[assignProblem] error:', error.message);
    return { error: 'Erro ao salvar encaminhamento' };
  }

  return { success: true };
}

export async function getSquadUsers(): Promise<{ users?: SquadUser[]; error?: string }> {
  await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, sectors(name)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('full_name');

  if (error) return { error: 'Erro ao carregar usuários' };

  const users: SquadUser[] = (data ?? []).map((p) => {
    const sector = p.sectors as { name: string } | { name: string }[] | null;
    const sectorName = Array.isArray(sector)
      ? (sector[0]?.name ?? null)
      : (sector?.name ?? null);
    return { id: p.id, full_name: p.full_name, sector_name: sectorName };
  });

  return { users };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/problemas-producao/actions/problemas-actions.ts
git commit -m "feat(actions): getProblems, assignProblem, getSquadUsers"
```

---

## Task 4: Instalar dependências de exportação

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar jsPDF, autotable e xlsx**

```bash
cd squados
npm install jspdf jspdf-autotable xlsx
npm install --save-dev @types/jspdf
```

- [ ] **Step 2: Confirmar instalação**

```bash
node -e "require('jspdf'); require('xlsx'); console.log('OK')"
```

Saída esperada: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): jspdf, jspdf-autotable, xlsx para exportação"
```

---

## Task 5: Componente ExportButton

**Files:**
- Create: `src/features/problemas-producao/components/export-button.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/features/problemas-producao/components/export-button.tsx
'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProductionProblem } from '../actions/problemas-actions';

interface ExportButtonProps {
  problems: ProductionProblem[];
}

function buildRows(problems: ProductionProblem[]) {
  return problems.map((p) => ({
    cliente: p.client_name,
    recebido_em: new Date(p.received_at).toLocaleString('pt-BR'),
    descricao: p.description,
    status: p.assignments.length > 0 ? 'Encaminhado' : 'Novo',
    encaminhado_para: p.assignments.map((a) => a.assigned_user_name).join(', ') || '—',
    solucao: p.assignments[0]?.solution ?? '—',
  }));
}

export function ExportButton({ problems }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function exportPdf() {
    setLoading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape' });

      doc.setFontSize(14);
      doc.text('Problemas de Produção', 14, 16);
      doc.setFontSize(9);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 22);

      autoTable(doc, {
        startY: 28,
        head: [['Cliente', 'Recebido em', 'Descrição', 'Status', 'Encaminhado para', 'Solução']],
        body: buildRows(problems).map((r) => [
          r.cliente, r.recebido_em, r.descricao, r.status, r.encaminhado_para, r.solucao,
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 2: { cellWidth: 70 }, 5: { cellWidth: 60 } },
      });

      doc.save(`problemas-producao-${Date.now()}.pdf`);
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
    setLoading(true);
    try {
      const XLSX = await import('xlsx');
      const rows = buildRows(problems);
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Problemas');
      XLSX.writeFile(wb, `problemas-producao-${Date.now()}.xlsx`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading || problems.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportPdf}>
          Exportar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportExcel}>
          Exportar Excel (.xlsx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/problemas-producao/components/export-button.tsx
git commit -m "feat(ui): ExportButton PDF e Excel para problemas de produção"
```

---

## Task 6: Componente UserAssignmentPanel

**Files:**
- Create: `src/features/problemas-producao/components/user-assignment-panel.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/features/problemas-producao/components/user-assignment-panel.tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { assignProblem, getSquadUsers } from '../actions/problemas-actions';
import type { SquadUser, ProblemAssignment } from '../actions/problemas-actions';

interface UserAssignmentPanelProps {
  problemId: string;
  existingAssignments: ProblemAssignment[];
  onClose: () => void;
  onSaved: () => void;
}

export function UserAssignmentPanel({
  problemId,
  existingAssignments,
  onClose,
  onSaved,
}: UserAssignmentPanelProps) {
  const [allUsers, setAllUsers] = useState<SquadUser[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    existingAssignments.map((a) => a.assigned_user_id)
  );
  const [solution, setSolution] = useState(existingAssignments[0]?.solution ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSquadUsers().then(({ users }) => setAllUsers(users ?? []));
  }, []);

  const filtered = allUsers.filter(
    (u) =>
      !selectedIds.includes(u.id) &&
      u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUsers = allUsers.filter((u) => selectedIds.includes(u.id));

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    if (!selectedIds.length) {
      setError('Selecione ao menos um usuário');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await assignProblem(problemId, selectedIds, solution);
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      onSaved();
    }
  }

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4 mt-3 space-y-4">
      {/* Usuários selecionados */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          Encaminhar para
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-xs"
            >
              {u.full_name}
              {u.sector_name && (
                <span className="text-muted-foreground">({u.sector_name})</span>
              )}
              <button onClick={() => toggle(u.id)} className="text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selectedIds.length === 0 && (
            <span className="text-xs text-muted-foreground italic">Nenhum usuário selecionado</span>
          )}
        </div>

        {/* Busca para adicionar */}
        <div className="relative">
          <Input
            placeholder="Buscar usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm h-8"
          />
          {search && filtered.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
              {filtered.slice(0, 8).map((u) => (
                <button
                  key={u.id}
                  onClick={() => { toggle(u.id); setSearch(''); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <Plus className="w-3 h-3 text-muted-foreground" />
                  <span>{u.full_name}</span>
                  {u.sector_name && (
                    <span className="text-muted-foreground text-xs ml-auto">{u.sector_name}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Solução do problema */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          Solução do Problema
        </p>
        <Textarea
          placeholder="Descreva a solução ou instrução para os responsáveis..."
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Confirmar encaminhamento
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/problemas-producao/components/user-assignment-panel.tsx
git commit -m "feat(ui): UserAssignmentPanel com seletor de usuários e campo solução"
```

---

## Task 7: Componente ProblemKpiCard

**Files:**
- Create: `src/features/problemas-producao/components/problem-kpi-card.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/features/problemas-producao/components/problem-kpi-card.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAssignmentPanel } from './user-assignment-panel';
import type { ProductionProblem } from '../actions/problemas-actions';

interface ProblemKpiCardProps {
  problem: ProductionProblem;
  isAdmin: boolean;
  onAssigned: () => void;
}

function StatusBadge({ problem }: { problem: ProductionProblem }) {
  if (problem.assignments.length > 0) {
    return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">ENCAMINHADO</Badge>;
  }
  return <Badge className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]">NOVO</Badge>;
}

function borderColor(problem: ProductionProblem) {
  if (problem.assignments.length > 0) return 'border-l-emerald-500';
  return 'border-l-red-500';
}

export function ProblemKpiCard({ problem, isAdmin, onAssigned }: ProblemKpiCardProps) {
  const [expanded, setExpanded] = useState(false);

  const formattedDate = new Date(problem.received_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`bg-card border border-l-4 ${borderColor(problem)} rounded-lg p-4`}>
      {/* Cabeçalho do card */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge problem={problem} />
            <span className="text-xs text-muted-foreground">
              Cliente: <span className="text-foreground font-medium">{problem.client_name}</span>
            </span>
            <span className="text-xs text-muted-foreground">· {formattedDate}</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{problem.description}</p>

          {/* Encaminhamento existente */}
          {problem.assignments.length > 0 && !expanded && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span>Encaminhado para:</span>
              {problem.assignments.map((a) => (
                <span key={a.id} className="text-primary">{a.assigned_user_name}</span>
              ))}
              {problem.assignments[0]?.solution && (
                <>
                  <span>·</span>
                  <span className="text-amber-500 italic truncate max-w-[200px]">
                    "{problem.assignments[0].solution}"
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-xs"
          >
            {expanded ? (
              <><ChevronUp className="w-3 h-3 mr-1" /> Fechar</>
            ) : problem.assignments.length > 0 ? (
              <><ChevronDown className="w-3 h-3 mr-1" /> Editar</>
            ) : (
              <><ChevronDown className="w-3 h-3 mr-1" /> Encaminhar</>
            )}
          </Button>
        )}
      </div>

      {/* Painel de encaminhamento (apenas admin, quando expandido) */}
      {isAdmin && expanded && (
        <UserAssignmentPanel
          problemId={problem.id}
          existingAssignments={problem.assignments}
          onClose={() => setExpanded(false)}
          onSaved={() => { setExpanded(false); onAssigned(); }}
        />
      )}

      {/* Visão do usuário designado: solução do CEO em destaque */}
      {!isAdmin && problem.assignments[0]?.solution && (
        <div className="mt-3 bg-amber-500/10 border-l-2 border-amber-500 rounded-r px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <span className="font-medium">💬 Solução do Problema: </span>
          {problem.assignments[0].solution}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/problemas-producao/components/problem-kpi-card.tsx
git commit -m "feat(ui): ProblemKpiCard com estados novo/encaminhado e painel inline"
```

---

## Task 8: Shell Principal

**Files:**
- Create: `src/features/problemas-producao/components/problemas-shell.tsx`

- [ ] **Step 1: Criar o shell**

```typescript
// src/features/problemas-producao/components/problemas-shell.tsx
'use client';

import { useState, useCallback, useTransition } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ProblemKpiCard } from './problem-kpi-card';
import { ExportButton } from './export-button';
import { getProblems } from '../actions/problemas-actions';
import type { ProductionProblem } from '../actions/problemas-actions';

type Filter = 'all' | 'pending' | 'assigned';

interface ProblemasShellProps {
  initialProblems: ProductionProblem[];
  isAdmin: boolean;
}

export function ProblemasShell({ initialProblems, isAdmin }: ProblemasShellProps) {
  const [problems, setProblems] = useState<ProductionProblem[]>(initialProblems);
  const [filter, setFilter] = useState<Filter>('all');
  const [, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const result = await getProblems();
      if (result.problems) setProblems(result.problems);
    });
  }, []);

  const filtered = problems.filter((p) => {
    if (filter === 'pending') return p.assignments.length === 0;
    if (filter === 'assigned') return p.assignments.length > 0;
    return true;
  });

  const pendingCount = problems.filter((p) => p.assignments.length === 0).length;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Problemas de Produção
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recebidos via CRM Live
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </p>
        </div>
        <ExportButton problems={filtered} />
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {([
          { key: 'all', label: 'Todos' },
          { key: 'pending', label: 'Pendentes' },
          { key: 'assigned', label: 'Encaminhados' },
        ] as { key: Filter; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista de cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum problema{filter !== 'all' ? ' nesta categoria' : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <ProblemKpiCard
              key={p.id}
              problem={p}
              isAdmin={isAdmin}
              onAssigned={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/problemas-producao/components/problemas-shell.tsx
git commit -m "feat(ui): ProblemasShell com filtros, contador e reload após encaminhamento"
```

---

## Task 9: Page e Navegação

**Files:**
- Create: `src/app/(app)/problemas-producao/page.tsx`
- Modify: `src/config/navigation.ts`

- [ ] **Step 1: Criar a page**

```typescript
// src/app/(app)/problemas-producao/page.tsx
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { getProblems } from '@/features/problemas-producao/actions/problemas-actions';
import { ProblemasShell } from '@/features/problemas-producao/components/problemas-shell';

export default async function ProblemasProducaoPage() {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  const { problems = [] } = await getProblems();

  return <ProblemasShell initialProblems={problems} isAdmin={isAdmin} />;
}
```

- [ ] **Step 2: Adicionar aba na navegação**

Em `src/config/navigation.ts`, adicionar `AlertTriangle` no import e a nova entrada no array `NAV_ITEMS`:

```typescript
// Linha 1 — adicionar AlertTriangle ao import existente:
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
  Target,
  Crosshair,
  PackageCheck,
  AlertTriangle,   // ← adicionar
} from 'lucide-react';
```

```typescript
// Em NAV_ITEMS, após a entrada 'Operações':
{ label: 'Problemas Produção', href: '/problemas-producao', icon: AlertTriangle, minRole: 'viewer' },
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/problemas-producao/page.tsx src/config/navigation.ts
git commit -m "feat(nav): aba Problemas Produção + page server component"
```

---

## Task 10: Teste de ponta a ponta

- [ ] **Step 1: Iniciar o servidor**

```bash
cd squados
npm run dev
```

- [ ] **Step 2: Enviar um problema via webhook (simula CRM)**

```bash
curl -X POST http://localhost:3000/api/problemas-producao/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: squad-problemas-webhook-2026" \
  -d '{
    "description": "Equipamento V12 Neuro entregue com defeito na regulagem da resistência. Cliente relata barulho anormal ao usar.",
    "client_name": "Clínica Bem Estar SP",
    "received_at": "2026-05-04T10:30:00Z"
  }'
```

Esperado: `{"id":"<uuid>"}` status 201

- [ ] **Step 3: Abrir a página no browser**

Navegar para `http://localhost:3000/problemas-producao`

Verificar:
- [ ] Card aparece com badge "NOVO" e borda vermelha
- [ ] Cliente e data/hora corretos
- [ ] Descrição completa visível
- [ ] Botão "Encaminhar" visível para admin
- [ ] Filtro "Pendentes" mostra o card, "Encaminhados" não mostra

- [ ] **Step 4: Testar encaminhamento (como admin)**

1. Clicar em "Encaminhar" no card
2. Buscar e selecionar 1 usuário
3. Digitar "Ligar para cliente e verificar peça" no campo Solução do Problema
4. Clicar "Confirmar encaminhamento"

Verificar:
- [ ] Card atualiza para badge "ENCAMINHADO" com borda verde
- [ ] Nome do usuário designado aparece abaixo da descrição
- [ ] Solução aparece em itálico

- [ ] **Step 5: Testar exportação**

1. Clicar "Exportar" → "Exportar PDF"
   - [ ] Download de arquivo `.pdf` com a lista de problemas
2. Clicar "Exportar" → "Exportar Excel (.xlsx)"
   - [ ] Download de arquivo `.xlsx`

- [ ] **Step 6: Testar webhook com secret errado**

```bash
curl -X POST http://localhost:3000/api/problemas-producao/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: wrong-secret" \
  -d '{"description":"teste","client_name":"test","received_at":"2026-05-04T10:00:00Z"}'
```

Esperado: `{"error":"Unauthorized"}` status 401

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "feat(problemas-producao): módulo completo — webhook, KPI cards, encaminhamento, exportação"
```

---

## Resumo dos arquivos criados

| Arquivo | Tipo |
|---------|------|
| `supabase/migrations/00067_production_problems.sql` | Migration |
| `src/app/api/problemas-producao/webhook/route.ts` | API Route |
| `src/features/problemas-producao/actions/problemas-actions.ts` | Server Actions |
| `src/features/problemas-producao/components/export-button.tsx` | Client Component |
| `src/features/problemas-producao/components/user-assignment-panel.tsx` | Client Component |
| `src/features/problemas-producao/components/problem-kpi-card.tsx` | Client Component |
| `src/features/problemas-producao/components/problemas-shell.tsx` | Client Shell |
| `src/app/(app)/problemas-producao/page.tsx` | Server Page |
| `src/config/navigation.ts` | Modificado |
