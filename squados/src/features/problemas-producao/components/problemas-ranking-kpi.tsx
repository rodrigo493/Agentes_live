'use client';

import { useState } from 'react';
import { X, AlertTriangle, TrendingUp } from 'lucide-react';

interface RankItem { description: string; count: number; }

interface Props { ranking: RankItem[]; }

const RANK_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-400',
  'bg-lime-400',
  'bg-green-400',
  'bg-teal-400',
  'bg-cyan-400',
  'bg-blue-400',
  'bg-violet-400',
];

function RankRow({ item, rank, max }: { item: RankItem; rank: number; max: number }) {
  const pct = max > 0 ? Math.round((item.count / max) * 100) : 0;
  const barColor = RANK_COLORS[(rank - 1) % RANK_COLORS.length];
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="text-[11px] font-bold text-muted-foreground w-5 text-right shrink-0">
        {rank}
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-xs font-medium leading-tight truncate" title={item.description}>
          {item.description}
        </p>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className={`text-[11px] font-bold shrink-0 tabular-nums px-1.5 py-0.5 rounded ${barColor} bg-opacity-20 text-foreground`}>
        {item.count}×
      </span>
    </div>
  );
}

export function ProblemasRankingKpi({ ranking }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (!ranking || ranking.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Problemas de Produção</h3>
        </div>
        <p className="text-xs text-muted-foreground">Nenhum problema registrado ainda.</p>
      </div>
    );
  }

  const top10 = ranking.slice(0, 10);
  const max = ranking[0].count;
  const hasMore = ranking.length > 10;
  const total = ranking.reduce((s, r) => s + r.count, 0);

  return (
    <>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Problemas de Produção</h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {total} ocorrência{total !== 1 ? 's' : ''} · {ranking.length} tipo{ranking.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Divisor */}
        <div className="border-t" />

        {/* Lista top 10 */}
        <div className="space-y-0 divide-y divide-border/50">
          {top10.map((item, i) => (
            <RankRow key={item.description} item={item} rank={i + 1} max={max} />
          ))}
        </div>

        {/* Ver todos */}
        {hasMore && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 rounded-lg py-1.5 transition-colors"
          >
            Ver todos — {ranking.length} tipos de problema
          </button>
        )}
      </div>

      {/* Modal com lista completa */}
      {showAll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAll(false); }}
        >
          <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border bg-card shadow-2xl">
            {/* Header modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="text-sm font-semibold">Todos os Problemas de Produção</h3>
                <p className="text-[11px] text-muted-foreground">
                  {total} ocorrências · {ranking.length} tipos · ranking por frequência
                </p>
              </div>
              <button
                onClick={() => setShowAll(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista completa */}
            <div className="overflow-y-auto flex-1 px-5 py-3 divide-y divide-border/50">
              {ranking.map((item, i) => (
                <RankRow key={item.description} item={item} rank={i + 1} max={max} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
