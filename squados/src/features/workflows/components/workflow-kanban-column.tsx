'use client';

import { KanbanCard } from './workflow-kanban-card';
import type { KanbanColumn as KanbanColumnData } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  column: KanbanColumnData;
  showAssignee?: boolean;
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

export function KanbanColumn({ column, showAssignee, onAdvance, onOpenNotes }: Props) {
  return (
    <div className="flex flex-col w-[200px] flex-shrink-0 rounded-xl bg-zinc-800/50 border border-zinc-700/60 overflow-hidden">
      <div className="px-3 py-2.5 text-center border-b border-zinc-700/60">
        <span className="text-xs font-semibold text-zinc-300">{column.step_title}</span>
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
