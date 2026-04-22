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
    return { label: `+${h}h${m}m`, color: 'text-red-600', state: 'overdue' as const };
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  // mais de 50% do tempo ja consumido — alerta amarelo
  if (diffMs / slaMs <= 0.5) {
    return { label: `${h}h${m}m`, color: 'text-yellow-600', state: 'warning' as const };
  }
  return { label: `${h}h${m}m`, color: 'text-emerald-600', state: 'ok' as const };
}

export function KanbanCard({ item, showAssignee, onAdvance, onOpenNotes }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const sla = computeSlaState(item);

  const borderClass =
    sla.state === 'overdue' ? 'border-red-500 animate-card-border-pulse' :
    sla.state === 'warning' ? 'border-yellow-500' :
    sla.state === 'ok' ? 'border-emerald-500' :
    'border-zinc-300';

  async function handleAdvance() {
    setAdvancing(true);
    try { await onAdvance(item.step_id); } finally { setAdvancing(false); }
  }

  return (
    <div className={`rounded-lg border-2 ${borderClass} bg-gray-100 px-3 py-2.5 space-y-1.5 shadow-sm`}>
      <p className="text-sm font-bold text-gray-900 leading-tight">{item.reference}</p>

      <div className="flex items-center justify-between gap-1 text-[11px]">
        {showAssignee && item.assignee_name ? (
          <span className="text-gray-600 truncate max-w-[70%]">{item.assignee_name}</span>
        ) : (
          <span />
        )}
        <span className={`font-semibold shrink-0 ${sla.color}`}>{sla.label}</span>
      </div>

      <div className="flex gap-1 pt-0.5">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 h-6 text-[10px] font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-200 px-2 gap-0.5"
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
          className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-200"
          onClick={() => onOpenNotes(item)}
        >
          <FileText className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
