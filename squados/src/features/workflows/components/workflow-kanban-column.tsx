'use client';

import { Badge } from '@/components/ui/badge';
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
    <div className="flex flex-col w-[200px] flex-shrink-0 bg-muted/30 rounded-xl border border-border overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border space-y-0.5"
           style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground flex-1 truncate">
            {column.step_order}. {column.step_title}
          </span>
          {overdueCount > 0 ? (
            <Badge variant="destructive" className="text-[9px] h-4 px-1">{overdueCount}</Badge>
          ) : (
            <Badge variant="secondary" className="text-[9px] h-4 px-1">{column.items.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {column.assignee_name && <span>👤 {column.assignee_name}</span>}
          <span className="ml-auto">⏱ {column.sla_hours}h SLA</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 max-h-[60vh]">
        {column.items.length === 0 ? (
          <div className="text-[10px] text-muted-foreground/50 text-center py-6">
            Nenhum item
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
