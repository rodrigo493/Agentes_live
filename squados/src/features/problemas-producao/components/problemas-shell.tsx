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
