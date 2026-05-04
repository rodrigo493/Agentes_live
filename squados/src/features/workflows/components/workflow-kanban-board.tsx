'use client';

import { useRef } from 'react';
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
  onAdvance: (stepId: string, targetStepTitle?: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
  onColumnSaved?: () => void;
}

export function KanbanBoard({ flow, showAssignee, isAdmin, users, sectors, onAdvance, onOpenNotes, onColumnSaved }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    dragging.current = true;
    startX.current = e.pageX - (boardRef.current?.offsetLeft ?? 0);
    scrollLeft.current = boardRef.current?.scrollLeft ?? 0;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    e.preventDefault();
    const x = e.pageX - (boardRef.current?.offsetLeft ?? 0);
    if (boardRef.current) boardRef.current.scrollLeft = scrollLeft.current - (x - startX.current) * 1.2;
  }
  function stopDrag() { dragging.current = false; }

  if (flow.columns.length === 0) {
    return (
      <div className="text-sm text-zinc-500 py-8 text-center border border-zinc-800 rounded-xl bg-zinc-900">
        Este fluxo não possui etapas configuradas.
      </div>
    );
  }

  return (
    <div
      ref={boardRef}
      className="flex gap-3 overflow-x-auto pb-3 pt-1 cursor-grab active:cursor-grabbing select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      {flow.columns.map((col, idx) => (
        <div key={col.template_step_id} className="flex items-start gap-3">
          <KanbanColumn
            column={col}
            columnIndex={idx}
            templateName={flow.template_name}
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
