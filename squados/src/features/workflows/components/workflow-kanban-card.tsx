'use client';

import { useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView;
  showAssignee?: boolean;
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

function computeSlaState(item: WorkItemView) {
  if (!item.due_at) return { label: '—', color: 'text-zinc-500', state: 'none' as const };
  const now = Date.now();
  const dueMs = new Date(item.due_at).getTime();
  const diffMs = dueMs - now;
  const slaMs = item.sla_hours * 3_600_000;

  if (diffMs < 0) {
    const h = Math.floor(Math.abs(diffMs) / 3_600_000);
    const m = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
    return { label: `+${h}h${m}m`, color: 'text-red-400', state: 'overdue' as const };
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffMs / slaMs <= 0.3) {
    return { label: `${h}h${m}m`, color: 'text-yellow-400', state: 'warning' as const };
  }
  return { label: `${h}h${m}m`, color: 'text-emerald-400', state: 'ok' as const };
}

export function KanbanCard({ item, showAssignee, onAdvance, onOpenNotes }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const sla = computeSlaState(item);

  const leftBorder =
    sla.state === 'overdue' ? 'border-l-red-500' :
    sla.state === 'warning' ? 'border-l-yellow-500' :
    'border-l-emerald-500/60';

  async function handleAdvance() {
    setAdvancing(true);
    try { await onAdvance(item.step_id); } finally { setAdvancing(false); }
  }

  return (
    <div className={`rounded-lg border border-zinc-700/60 border-l-4 ${leftBorder} bg-zinc-800/80 px-3 py-2.5 space-y-1.5`}>
      <p className="text-sm font-bold text-white leading-tight">{item.reference}</p>

      <div className="flex items-center justify-between gap-1 text-[11px]">
        {showAssignee && item.assignee_name ? (
          <span className="text-zinc-400 truncate max-w-[70%]">{item.assignee_name}</span>
        ) : (
          <span />
        )}
        <span className={`font-semibold shrink-0 ${sla.color}`}>{sla.label}</span>
      </div>

      <div className="flex gap-1 pt-0.5">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 h-6 text-[10px] font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700 px-2 gap-0.5"
          disabled={advancing}
          onClick={handleAdvance}
        >
          {advancing ? '…' : (
            item.next_step_title
              ? <><ChevronRight className="w-3 h-3" />{item.next_step_title}</>
              : '✓ Concluir'
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700"
          onClick={() => onOpenNotes(item)}
        >
          <FileText className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
