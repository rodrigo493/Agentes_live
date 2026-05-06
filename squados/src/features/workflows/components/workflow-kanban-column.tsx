'use client';

import { useState } from 'react';
import { Pencil, Check, X, Plus, GitFork, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { upsertTemplateStepAction, listTemplatesAction } from '../actions/template-actions';
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
  allSteps?: Array<{ id: string; step_order: number; title: string }>;
  allTemplates?: Array<{ id: string; name: string }>;
}

export function KanbanColumn({
  column, columnIndex = 0, templateName, showAssignee, isAdmin, users = [], sectors = [],
  onAdvance, onOpenNotes, onColumnSaved, allSteps = [], allTemplates = [],
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [title, setTitle] = useState(column.step_title);
  const [sla, setSla] = useState(column.sla_hours);
  const [assigneeUserId, setAssigneeUserId] = useState(column.assignee_user_id ?? '');
  const [assigneeSectorId, setAssigneeSectorId] = useState(column.assignee_sector_id ?? '');

  // Bloco A — destination steps
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>([])

  // Bloco B — fork configuration
  const [forkOpen, setForkOpen] = useState(false)
  const [forkTemplateId, setForkTemplateId] = useState<string | null>(null)
  const [forkEntryStepOrder, setForkEntryStepOrder] = useState<number | null>(null)
  const [forkResolveStepTitle, setForkResolveStepTitle] = useState<string | null>(null)
  const [forkTemplates, setForkTemplates] = useState<Array<{ id: string; name: string; steps?: Array<{ step_order: number; title: string }> }>>([])
  const [loadingForkTemplates, setLoadingForkTemplates] = useState(false)

  const accentColor = STEP_COLORS[columnIndex % STEP_COLORS.length];

  const loadForkTemplates = async () => {
    if (forkTemplates.length > 0) return
    setLoadingForkTemplates(true)
    try {
      const result = await listTemplatesAction()
      setForkTemplates(result.templates?.map(t => ({
        id: t.id,
        name: t.name,
        steps: t.steps?.map((s: { step_order: number; title: string }) => ({ step_order: s.step_order, title: s.title })) ?? []
      })) ?? [])
    } finally {
      setLoadingForkTemplates(false)
    }
  }

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
        branch_options: selectedDestinations.length > 0
          ? selectedDestinations.map(t => ({ label: t, target_title: t }))
          : null,
        fork_template_id: forkTemplateId,
        fork_entry_step_order: forkEntryStepOrder,
        fork_resolve_step_title: forkResolveStepTitle,
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
    // Reset Bloco A
    const existingDestinations = (column.branch_options ?? []).map((bo: { label: string; target_title: string }) => bo.target_title)
    setSelectedDestinations(existingDestinations)
    // Reset Bloco B
    setForkTemplateId(column.fork_template_id ?? null)
    setForkEntryStepOrder(column.fork_entry_step_order ?? null)
    setForkResolveStepTitle(column.fork_resolve_step_title ?? null)
    setForkOpen(!!column.fork_template_id)
    setEditing(false);
  }

  function handleOpenEditor() {
    // Initialize Bloco A from existing branch_options
    const existingDestinations = (column.branch_options ?? []).map((bo: { label: string; target_title: string }) => bo.target_title)
    setSelectedDestinations(existingDestinations)
    // Initialize Bloco B from existing fork config
    setForkTemplateId(column.fork_template_id ?? null)
    setForkEntryStepOrder(column.fork_entry_step_order ?? null)
    setForkResolveStepTitle(column.fork_resolve_step_title ?? null)
    setForkOpen(!!column.fork_template_id)
    setEditing(true)
  }

  return (
    <div
      className="flex flex-col w-[245px] flex-shrink-0 rounded-xl bg-zinc-900/70 border border-zinc-700/50 overflow-hidden shadow-md"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      {/* Header */}
      {editing ? (
        <div className="px-3 py-2.5 border-b border-zinc-700/50 bg-zinc-900 max-h-[70vh] overflow-y-auto">
          <div className="space-y-2">
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

            {/* Bloco A — Etapas de destino */}
            {allSteps && allSteps.length > 0 && (
              <div className="mt-4">
                <p className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  Etapas de destino
                </p>
                <div className="space-y-1">
                  {allSteps
                    .filter(s => s.title !== column.step_title)
                    .sort((a, b) => a.step_order - b.step_order)
                    .map(step => (
                      <label key={step.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-zinc-600 bg-zinc-700 text-violet-500"
                          checked={selectedDestinations.includes(step.title)}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedDestinations(prev => [...prev, step.title])
                            } else {
                              setSelectedDestinations(prev => prev.filter(t => t !== step.title))
                            }
                          }}
                        />
                        <span className="text-xs text-zinc-300">{step.title}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}

            {/* Bloco B — Fork de fluxo */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setForkOpen(v => !v)
                  if (!forkOpen) loadForkTemplates()
                }}
                className="flex items-center gap-2 text-[9px] font-semibold text-zinc-500 uppercase tracking-wide hover:text-zinc-200 transition-colors"
              >
                <GitFork className="w-3.5 h-3.5" />
                Fork de fluxo
                <ChevronDown className={`w-3 h-3 transition-transform ${forkOpen ? 'rotate-180' : ''}`} />
              </button>

              {forkOpen && (
                <div className="mt-2 space-y-3 pl-2 border-l border-zinc-700">
                  {loadingForkTemplates ? (
                    <p className="text-xs text-zinc-500">Carregando fluxos...</p>
                  ) : (
                    <>
                      {/* Flow selector */}
                      <div>
                        <label className="text-[9px] text-zinc-500 mb-1 block">Fluxo de destino</label>
                        <select
                          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                          value={forkTemplateId ?? ''}
                          onChange={e => {
                            const val = e.target.value || null
                            setForkTemplateId(val)
                            setForkEntryStepOrder(null)
                            setForkResolveStepTitle(null)
                          }}
                        >
                          <option value="">Nenhum</option>
                          {forkTemplates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>

                      {forkTemplateId && (
                        <>
                          {/* Entry step */}
                          <div>
                            <label className="text-[9px] text-zinc-500 mb-1 block">Etapa de entrada</label>
                            <select
                              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                              value={forkEntryStepOrder?.toString() ?? ''}
                              onChange={e => setForkEntryStepOrder(e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">Selecionar...</option>
                              {forkTemplates.find(t => t.id === forkTemplateId)?.steps
                                ?.sort((a, b) => a.step_order - b.step_order)
                                .map(s => (
                                  <option key={s.step_order} value={s.step_order}>
                                    {s.step_order}. {s.title}
                                  </option>
                                ))}
                            </select>
                          </div>

                          {/* Resolve step */}
                          <div>
                            <label className="text-[9px] text-zinc-500 mb-1 block">Etapa de resolução</label>
                            <select
                              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
                              value={forkResolveStepTitle ?? ''}
                              onChange={e => setForkResolveStepTitle(e.target.value || null)}
                            >
                              <option value="">Selecionar...</option>
                              {forkTemplates.find(t => t.id === forkTemplateId)?.steps
                                ?.sort((a, b) => a.step_order - b.step_order)
                                .map(s => (
                                  <option key={s.title} value={s.title}>{s.title}</option>
                                ))}
                            </select>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
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
              onClick={handleOpenEditor}
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
