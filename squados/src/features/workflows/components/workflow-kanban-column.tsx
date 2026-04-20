'use client';

import { KanbanCard } from './workflow-kanban-card';
import type { KanbanColumn as KanbanColumnData } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';

const STEP_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#0891b2',
  '#10b981', '#ef4444', '#ec4899', '#84cc16',
];

interface Props {
  column: KanbanColumnData;
  showAssignee?: boolean;
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

export function KanbanColumn({ column, showAssignee, onAdvance, onOpenNotes }: Props) {
  const color = STEP_COLORS[(column.step_order - 1) % STEP_COLORS.length];
  const overdueCount = column.items.filter(
    (i) => i.due_at && new Date(i.due_at).getTime() < Date.now(),
  ).length;

  return (
    <div className="flex flex-col w-[210px] flex-shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-zinc-800" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white flex-1 truncate">
            {column.step_order}. {column.step_title}
          </span>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: overdueCount > 0 ? '#ef4444' : '#3f3f46', color: overdueCount > 0 ? '#fff' : '#a1a1aa' }}
          >
            {overdueCount > 0 ? `${overdueCount}!` : column.items.length}
          </span>
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">
          {column.assignee_name ? `${column.assignee_name} · ` : ''}{column.sla_hours}h SLA
        </div>
      </div>

      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 max-h-[60vh]">
        {column.items.length === 0 ? (
          <div className="text-[11px] text-zinc-600 text-center py-8 font-medium">
            vazio
          </div>
        ) : (
          column.items.map((item) => (
            <KanbanCard
              key={item.step_id}
              item={item}
              showAssignee={showAssignee}
              onAdvance={onAdvance}
              onOpenNotes={onOpenNotes}
            />
          ))
        )}
      </div>
    </div>
  );
}
