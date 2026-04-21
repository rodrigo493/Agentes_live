'use client';

import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { upsertTemplateStepAction } from '../actions/template-actions';
import { KanbanCard } from './workflow-kanban-card';
import type { KanbanColumn as KanbanColumnData } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import type { Sector, Profile } from '@/shared/types/database';

interface Props {
  column: KanbanColumnData;
  showAssignee?: boolean;
  isAdmin?: boolean;
  users?: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  sectors?: Sector[];
  onAdvance: (stepId: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
  onColumnSaved?: () => void;
}

export function KanbanColumn({
  column, showAssignee, isAdmin, users = [], sectors = [],
  onAdvance, onOpenNotes, onColumnSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(column.step_title);
  const [sla, setSla] = useState(column.sla_hours);
  const [assigneeUserId, setAssigneeUserId] = useState(column.assignee_user_id ?? '');
  const [assigneeSectorId, setAssigneeSectorId] = useState(column.assignee_sector_id ?? '');

  async function handleSave() {
    if (!title.trim()) return toast.error('Título obrigatório');
    setSaving(true);
    try {
      const r = await upsertTemplateStepAction({
        id: column.template_step_id,
        template_id: column.template_id,
        step_order: column.step_order,
        title: title.trim(),
        sla_hours: sla,
        assignee_user_id: assigneeUserId || null,
        assignee_sector_id: assigneeSectorId || null,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success('Etapa salva');
      setEditing(false);
      onColumnSaved?.();
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setTitle(column.step_title);
    setSla(column.sla_hours);
    setAssigneeUserId(column.assignee_user_id ?? '');
    setAssigneeSectorId(column.assignee_sector_id ?? '');
    setEditing(false);
  }

  return (
    <div className="flex flex-col w-[210px] flex-shrink-0 rounded-xl bg-zinc-800/50 border border-zinc-700/60 overflow-visible">
      {/* Header */}
      {editing ? (
        <div className="px-2 py-2 border-b border-zinc-700/60 space-y-1.5 bg-zinc-800 rounded-t-xl">
          <input
            className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da etapa"
          />
          <div className="grid grid-cols-2 gap-1">
            <div>
              <div className="text-[9px] text-zinc-500 mb-0.5">SLA (horas)</div>
              <input
                type="number" min={1}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                value={sla}
                onChange={(e) => setSla(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500 mb-0.5">Responsável (usuário)</div>
            <select
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
              value={assigneeUserId}
              onChange={(e) => { setAssigneeUserId(e.target.value); if (e.target.value) setAssigneeSectorId(''); }}
            >
              <option value="">— nenhum —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500 mb-0.5">OU Setor</div>
            <select
              className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
              value={assigneeSectorId}
              onChange={(e) => { setAssigneeSectorId(e.target.value); if (e.target.value) setAssigneeUserId(''); }}
            >
              <option value="">— nenhum —</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex gap-1 pt-0.5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-semibold disabled:opacity-50"
            >
              <Check className="w-3 h-3" /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px]"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2.5 flex items-center gap-1 border-b border-zinc-700/60 group/header">
          <span className="text-xs font-semibold text-zinc-300 flex-1 text-center truncate">
            {column.step_title}
          </span>
          {isAdmin && (
            <button
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover/header:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity shrink-0"
              title="Editar etapa"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 max-h-[60vh]">
        {column.items.length === 0 ? (
          <div className="text-[11px] text-zinc-600 text-center py-8 font-medium">vazio</div>
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
