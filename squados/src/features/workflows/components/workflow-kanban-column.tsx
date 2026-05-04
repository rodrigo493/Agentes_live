'use client';

import { useState } from 'react';
import { Pencil, Check, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { upsertTemplateStepAction } from '../actions/template-actions';
import { KanbanCard } from './workflow-kanban-card';
import { NewCardSheet } from './new-card-sheet';
import type { KanbanColumn as KanbanColumnData } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import type { Sector, Profile } from '@/shared/types/database';

const STEP_COLORS = [
  '#94a3b8', // slate
  '#f97316', // orange
  '#3b82f6', // blue
  '#ec4899', // pink
  '#14b8a6', // teal
  '#22c55e', // green
  '#a855f7', // violet
  '#eab308', // yellow
  '#ef4444', // red
  '#06b6d4', // cyan
];

interface Props {
  column: KanbanColumnData;
  columnIndex?: number;
  templateName: string;
  showAssignee?: boolean;
  isAdmin?: boolean;
  users?: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  sectors?: Sector[];
  onAdvance: (stepId: string, targetStepTitle?: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
  onColumnSaved?: () => void;
}

export function KanbanColumn({
  column, columnIndex = 0, templateName, showAssignee, isAdmin, users = [], sectors = [],
  onAdvance, onOpenNotes, onColumnSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [title, setTitle] = useState(column.step_title);
  const [sla, setSla] = useState(column.sla_hours);
  const [assigneeUserId, setAssigneeUserId] = useState(column.assignee_user_id ?? '');
  const [assigneeSectorId, setAssigneeSectorId] = useState(column.assignee_sector_id ?? '');

  const accentColor = STEP_COLORS[columnIndex % STEP_COLORS.length];

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
    <div
      className="flex flex-col w-[245px] flex-shrink-0 rounded-xl bg-zinc-900/70 border border-zinc-700/50 overflow-hidden shadow-md"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      {/* Header */}
      {editing ? (
        <div className="px-3 py-2.5 border-b border-zinc-700/50 space-y-2 bg-zinc-900">
          <input
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da etapa"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <div className="text-[9px] text-zinc-500 mb-1">SLA (horas)</div>
              <input
                type="number" min={1}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                value={sla}
                onChange={(e) => setSla(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500 mb-1">Responsável (usuário)</div>
            <select
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
            >
              <option value="">— nenhum —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500 mb-1">Setor (combinável)</div>
            <select
              className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
              value={assigneeSectorId}
              onChange={(e) => setAssigneeSectorId(e.target.value)}
            >
              <option value="">— nenhum —</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-semibold disabled:opacity-50 transition-colors"
            >
              <Check className="w-3 h-3" /> {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              onClick={handleCancel}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2.5 flex items-center gap-2 border-b border-zinc-700/40 group/header">
          <span
            className="text-xs font-bold flex-1 truncate"
            style={{ color: accentColor }}
          >
            {column.step_title}
          </span>
          <span className="text-[10px] font-semibold bg-zinc-700/60 text-zinc-300 rounded-full px-1.5 py-0.5 min-w-[20px] text-center shrink-0">
            {column.items.length}
          </span>
          {isAdmin && (
            <button
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover/header:opacity-100 text-zinc-500 hover:text-zinc-300 transition-all shrink-0"
              title="Editar etapa"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 max-h-[62vh]">
        {column.items.length === 0 ? (
          <div className="text-[11px] text-zinc-600 text-center py-10 font-medium">vazio</div>
        ) : (
          column.items.map((item) => (
            <KanbanCard
              key={item.step_id}
              item={item}
              showAssignee={showAssignee}
              isAdmin={isAdmin}
              onAdvance={onAdvance}
              onOpenNotes={onOpenNotes}
              onDeleted={onColumnSaved}
            />
          ))
        )}
      </div>

      {/* Novo card (admin) */}
      {isAdmin && (
        <div className="px-2 pb-2">
          <button
            onClick={() => setNewCardOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-zinc-700 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400 text-[11px] font-medium transition-colors"
          >
            <Plus className="w-3 h-3" /> Novo card
          </button>
        </div>
      )}

      <NewCardSheet
        open={newCardOpen}
        templateId={column.template_id}
        templateName={templateName}
        users={users}
        onClose={() => setNewCardOpen(false)}
        onCreated={() => { setNewCardOpen(false); onColumnSaved?.(); }}
      />
    </div>
  );
}
