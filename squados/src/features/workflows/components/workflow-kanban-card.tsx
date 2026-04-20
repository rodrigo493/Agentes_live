'use client';

import { useState } from 'react';
import { Clock, AlertTriangle, ChevronRight, FileText, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView;
  showAssignee?: boolean;
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

function computeSlaState(item: WorkItemView) {
  if (!item.due_at) return { label: 'Sem prazo', color: 'text-muted-foreground', state: 'none' as const };
  const now = Date.now();
  const dueMs = new Date(item.due_at).getTime();
  const diffMs = dueMs - now;
  const slaMs = item.sla_hours * 3_600_000;

  if (diffMs < 0) {
    const h = Math.floor(Math.abs(diffMs) / 3_600_000);
    const m = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
    return { label: `+${h}h ${m}min além`, color: 'text-red-500', state: 'overdue' as const };
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffMs / slaMs <= 0.3) {
    return { label: `${h}h ${m}min`, color: 'text-yellow-500', state: 'warning' as const };
  }
  return { label: `${h}h ${m}min`, color: 'text-emerald-500', state: 'ok' as const };
}

export function KanbanCard({ item, showAssignee, onAdvance, onOpenNotes }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const sla = computeSlaState(item);

  const borderClass =
    sla.state === 'overdue'
      ? 'border-l-4 border-l-red-500 bg-red-500/5'
      : sla.state === 'warning'
        ? 'border-l-4 border-l-yellow-500'
        : 'border-l-4 border-l-emerald-500/50';

  async function handleAdvance() {
    setAdvancing(true);
    try { await onAdvance(item.step_id); } finally { setAdvancing(false); }
  }

  const lastNote = item.notes.at(-1);

  return (
    <div className={`rounded-lg border border-border p-3 space-y-2 bg-card ${borderClass} relative`}>
      {sla.state === 'overdue' && (
        <Badge variant="destructive" className="absolute -top-2 -right-2 text-[9px] px-1 py-0.5 flex items-center gap-0.5">
          <AlertTriangle className="w-2.5 h-2.5" /> ATRASADO
        </Badge>
      )}

      <div>
        <p className="text-sm font-bold leading-tight">{item.reference}</p>
        {item.title && (
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{item.title}</p>
        )}
      </div>

      {showAssignee && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <User className="w-3 h-3" />
          <span>{item.assignee_id.slice(0, 8)}…</span>
        </div>
      )}

      <div className={`flex items-center gap-1 text-[11px] font-semibold ${sla.color}`}>
        <Clock className="w-3 h-3 flex-shrink-0" />
        {sla.label}
      </div>

      {lastNote && (
        <p className="text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1 border-l-2 border-border line-clamp-2">
          {lastNote.text}
        </p>
      )}

      <div className="flex gap-1 pt-0.5">
        {item.next_step_title ? (
          <Button
            size="sm"
            className="flex-1 h-7 text-[10px] font-bold gap-0.5"
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
