'use client';

import { KanbanColumn } from './workflow-kanban-column';
import type { KanbanFlow } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import type { Sector, Profile } from '@/shared/types/database';

interface Props {
  flow: KanbanFlow;
  showAssignee?: boolean;
  isAdmin?: boolean;
  users?: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  sectors?: Sector[];
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
  onColumnSaved?: () => void;
}

export function KanbanBoard({ flow, showAssignee, isAdmin, users, sectors, onAdvance, onOpenNotes, onColumnSaved }: Props) {
  if (flow.columns.length === 0) {
    return (
      <div className="text-sm text-zinc-500 py-8 text-center border border-zinc-800 rounded-xl bg-zinc-900">
        Este fluxo não possui etapas configuradas.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 pt-1">
      {flow.columns.map((col, idx) => (
        <div key={col.template_step_id} className="flex items-start gap-3">
          <KanbanColumn
            column={col}
            showAssignee={showAssignee}
            isAdmin={isAdmin}
            users={users}
            sectors={sectors}
            onAdvance={onAdvance}
            onOpenNotes={onOpenNotes}
            onColumnSaved={onColumnSaved}
          />
          {idx < flow.columns.length - 1 && (
            <div className="text-zinc-700 text-lg mt-8 flex-shrink-0">›</div>
          )}
        </div>
      ))}
    </div>
  );
}
