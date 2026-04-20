'use client';

import { KanbanColumn } from './workflow-kanban-column';
import type { KanbanFlow } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  flow: KanbanFlow;
  showAssignee?: boolean;
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
}

export function KanbanBoard({ flow, showAssignee, onAdvance, onOpenNotes }: Props) {
  if (flow.columns.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center border rounded-xl">
        Este fluxo não possui etapas configuradas.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 pt-1">
      {flow.columns.map((col, idx) => (
        <div key={col.step_order} className="flex items-start gap-3">
          <KanbanColumn
            column={col}
            showAssignee={showAssignee}
            onAdvance={onAdvance}
            onOpenNotes={onOpenNotes}
          />
          {idx < flow.columns.length - 1 && (
            <div className="text-muted-foreground/30 text-lg mt-8 flex-shrink-0">›</div>
          )}
        </div>
      ))}
    </div>
  );
}
