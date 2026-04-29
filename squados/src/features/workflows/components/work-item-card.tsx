'use client';

import { useState } from 'react';
import { Clock, AlertTriangle, ChevronRight, FileText, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView;
  onAdvance: (stepId: string, note?: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

function computeTimerState(item: WorkItemView) {
  const now = Date.now();
  const slaMs = item.sla_hours * 3_600_000;

  if (!item.due_at) {
    return { label: 'Sem prazo', color: 'text-muted-foreground', state: 'none' as const };
  }

  const dueMs = new Date(item.due_at).getTime();
  const diffMs = dueMs - now;

  if (diffMs < 0) {
    const h = Math.floor(Math.abs(diffMs) / 3_600_000);
    const m = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
    return {
      label: `+${h}h ${m}min além do prazo`,
      color: 'text-red-500',
      state: 'overdue' as const,
    };
  }

  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  const pct = diffMs / slaMs;

  if (pct <= 0.3) {
    return { label: `${h}h ${m}min restantes`, color: 'text-yellow-500', state: 'warning' as const };
  }
  return { label: `${h}h ${m}min restantes`, color: 'text-emerald-500', state: 'ok' as const };
}

function ObservacoesCardButton({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="w-full flex items-center gap-1.5 rounded-lg border-2 border-amber-400 bg-amber-400 px-2.5 py-1.5 text-[10px] font-bold text-amber-900 shadow transition-all hover:bg-amber-300"
        style={{ animation: 'observacoes-pulse 2s ease-in-out infinite' }}
      >
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        Observações do Pos-Venda
        <span className="ml-auto h-2 w-2 rounded-full bg-amber-600 border border-white"
          style={{ animation: 'observacoes-dot 2s ease-in-out infinite' }} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative w-full max-w-md rounded-2xl border-2 border-amber-400 bg-white dark:bg-zinc-900 shadow-2xl p-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Observações do Pos-Venda
              </h3>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {notes}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export function WorkItemCard({ item, onAdvance, onOpenNotes }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const timer = computeTimerState(item);

  const borderClass =
    timer.state === 'overdue'
      ? 'border-red-500 bg-red-500/5'
      : timer.state === 'warning'
        ? 'border-yellow-500/50'
        : 'border-border';

  async function handleAdvance() {
    setAdvancing(true);
    try {
      await onAdvance(item.step_id);
    } finally {
      setAdvancing(false);
    }
  }

  const lastNote = item.notes.at(-1);

  return (
    <div className={`relative rounded-lg border p-3 space-y-2 min-w-[180px] max-w-[220px] flex-1 ${borderClass}`}>
      {timer.state === 'overdue' && (
        <Badge variant="destructive" className="absolute -top-2 -right-2 text-[9px] px-1.5 py-0.5 flex items-center gap-0.5">
          <AlertTriangle className="w-2.5 h-2.5" /> ATRASADO
        </Badge>
      )}

      <div>
        <p className="text-sm font-bold leading-tight">{item.reference}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {item.step_title}
        </p>
      </div>

      <div className={`flex items-center gap-1 text-[11px] font-semibold ${timer.color}`}>
        <Clock className="w-3 h-3 flex-shrink-0" />
        {timer.label}
      </div>

      {item.due_at && (
        <p className="text-[10px] text-muted-foreground">
          Prazo: {new Date(item.due_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {lastNote && (
        <div className="text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1.5 border-l-2 border-border line-clamp-2">
          <span className="font-medium">{lastNote.step_title}:</span> {lastNote.text}
        </div>
      )}

      {item.posvenda_notes && (
        <ObservacoesCardButton notes={item.posvenda_notes} />
      )}

      <div className="flex gap-1.5 pt-1">
        {item.next_step_title ? (
          <Button
            size="sm"
            className="flex-1 h-7 text-[10px] font-bold gap-1"
            disabled={advancing}
            onClick={handleAdvance}
          >
            {advancing ? 'Avançando…' : (
              <>✓ Avançar <ChevronRight className="w-3 h-3" /> {item.next_step_title}</>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-[10px] font-bold text-emerald-600 border-emerald-600/40"
            disabled={advancing}
            onClick={handleAdvance}
          >
            {advancing ? 'Concluindo…' : '✓ Concluir'}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground"
          onClick={() => onOpenNotes(item)}
          title="Ver / adicionar notas"
        >
          <FileText className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
