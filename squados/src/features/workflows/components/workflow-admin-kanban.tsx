'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Folder, Pencil, Play, Trash2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminKanbanAction } from '../actions/kanban-actions';
import { advanceWithNoteAction } from '../actions/pasta-actions';
import { checkAndDeleteTemplateAction } from '../actions/template-actions';
import type { KanbanFlow } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import type { ActiveInstanceInfo } from '../actions/template-actions';
import { KanbanBoard } from './workflow-kanban-board';
import { ItemNotesSheet } from './item-notes-sheet';
import { NewItemModal } from './new-item-modal';
import type { Sector, Profile } from '@/shared/types/database';

interface TemplateStep {
  id: string;
  step_order: number;
  title: string;
  sla_hours: number;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
}

interface Template {
  id: string;
  name: string;
  color?: string | null;
  steps?: TemplateStep[];
}

interface Props {
  templates: Template[];
  users?: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  sectors?: Sector[];
  onNewFlow?: () => void;
  onEditFlow?: (templateId: string) => void;
  onStartFlow?: (templateId: string) => void;
  onFlowDeleted?: (templateId: string) => void;
}

interface DeleteWarning {
  templateId: string;
  templateName: string;
  activeInstances: ActiveInstanceInfo[];
}

export function AdminKanbanView({ templates, users = [], sectors = [], onNewFlow, onEditFlow, onStartFlow, onFlowDeleted }: Props) {
  const [flows, setFlows] = useState<KanbanFlow[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesItem, setNotesItem] = useState<WorkItemView | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<DeleteWarning | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (switchToTemplateId?: string) => {
    try {
      const r = await getAdminKanbanAction();
      if (r.flows) {
        setFlows(r.flows);
        setActiveTab((prev) => {
          if (switchToTemplateId) return switchToTemplateId;
          return prev ?? (r.flows!.length > 0 ? r.flows![0].template_id : null);
        });
      }
    } catch (err) {
      console.error('Falha ao carregar kanban admin:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleAdvance(stepId: string) {
    await advanceWithNoteAction(stepId);
    await load();
  }

  async function handleDeleteClick(templateId: string, templateName: string) {
    setDeleting(templateId);
    try {
      const r = await checkAndDeleteTemplateAction(templateId);
      if (r.error) { toast.error(r.error); return; }
      if (r.deleted) {
        toast.success(`Fluxo "${templateName}" excluído.`);
        if (activeTab === templateId) setActiveTab(null);
        onFlowDeleted?.(templateId);
        await load();
        return;
      }
      if (r.activeInstances) {
        setDeleteWarning({ templateId, templateName, activeInstances: r.activeInstances });
      }
    } finally {
      setDeleting(null);
    }
  }

  const allTabs = templates.map((t) => {
    const flow = flows.find((f) => f.template_id === t.id);
    return { id: t.id, name: t.name, flow: flow ?? null };
  });

  if (loading) {
    return <div className="text-sm text-zinc-500 py-12 text-center">Carregando…</div>;
  }

  const activeFlowFromAction = flows.find((f) => f.template_id === activeTab) ?? null;
  const activeTemplate = activeTab ? templates.find((t) => t.id === activeTab) : null;
  const activeFlow: KanbanFlow | null = activeFlowFromAction ?? (() => {
    if (!activeTemplate?.steps?.length) return null;
    const userMap = new Map(users.map((u) => [u.id, u.full_name ?? '']));
    return {
      template_id: activeTemplate.id,
      template_name: activeTemplate.name,
      template_color: activeTemplate.color ?? '#6366f1',
      columns: [...(activeTemplate.steps ?? [])]
        .sort((a, b) => a.step_order - b.step_order)
        .map((s) => ({
          template_step_id: s.id,
          template_id: activeTemplate.id,
          step_order: s.step_order,
          step_title: s.title,
          sla_hours: s.sla_hours,
          assignee_name: s.assignee_user_id ? (userMap.get(s.assignee_user_id) ?? null) : null,
          assignee_user_id: s.assignee_user_id,
          assignee_sector_id: s.assignee_sector_id,
          items: [],
        })),
      overdue_count: 0,
    };
  })();

  return (
    <div className="space-y-3">
      {/* Tabs de pasta + botões */}
      <div className="flex items-center gap-2 flex-wrap">
        {allTabs.map(({ id, name, flow }) => {
          const isActive = activeTab === id;
          const overdueCount = flow?.overdue_count ?? 0;
          const color = flow?.template_color ?? '#8b5cf6';
          return (
            <div key={id} className="relative group">
              <button
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  isActive
                    ? 'bg-violet-600 text-white border-violet-500'
                    : 'bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:border-zinc-500 hover:text-white'
                }`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? '#fbbf24' : color }} />
                {name}
                {overdueCount > 0 && (
                  <span className="bg-red-500 text-white rounded-full px-1.5 text-[9px] font-bold leading-4 ml-0.5">
                    {overdueCount}
                  </span>
                )}
              </button>
              {/* Ícones de ação (hover) */}
              <div className="absolute -top-1.5 -right-1.5 hidden group-hover:flex gap-0.5">
                {onStartFlow && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onStartFlow(id); }}
                    className="w-5 h-5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center"
                    title="Iniciar novo item"
                  >
                    <Play className="w-2.5 h-2.5 fill-white" />
                  </button>
                )}
                {onEditFlow && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditFlow(id); }}
                    className="w-5 h-5 rounded-full bg-zinc-600 hover:bg-zinc-500 text-white flex items-center justify-center"
                    title="Editar fluxo"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteClick(id, name); }}
                  disabled={deleting === id}
                  className="w-5 h-5 rounded-full bg-red-700 hover:bg-red-600 text-white flex items-center justify-center disabled:opacity-50"
                  title="Excluir fluxo"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          );
        })}

        <button
          onClick={onNewFlow}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Novo fluxo
        </button>

        <button
          onClick={() => setNewItemOpen(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Novo item
        </button>
      </div>

      {/* Board */}
      {activeTab ? (
        activeFlow ? (
          <KanbanBoard
            flow={activeFlow}
            showAssignee={true}
            isAdmin={true}
            users={users}
            sectors={sectors}
            onAdvance={handleAdvance}
            onOpenNotes={setNotesItem}
            onColumnSaved={load}
          />
        ) : (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-10 text-center space-y-3">
            <p className="text-sm text-zinc-500">Nenhum item ativo neste fluxo.</p>
            {onStartFlow && (
              <button
                onClick={() => onStartFlow(activeTab)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Iniciar primeiro item
              </button>
            )}
          </div>
        )
      ) : (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-10 text-center text-sm text-zinc-500">
          Nenhum fluxo cadastrado. Clique em "+ Novo fluxo" para começar.
        </div>
      )}

      {/* Admin info bar */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-400 leading-relaxed">
        <span className="font-bold">Admin pode:</span> ver todos os cards de todos os usuários · reatribuir etapa para outro usuário · adicionar notas em qualquer etapa · ver histórico completo · exportar relatório · criar/editar fluxos
      </div>

      {/* Modal de aviso — instâncias ativas */}
      {deleteWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-md mx-4 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-yellow-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-bold text-sm">Não é possível excluir</h3>
              </div>
              <button onClick={() => setDeleteWarning(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              O fluxo <span className="font-semibold text-white">"{deleteWarning.templateName}"</span> tem{' '}
              <span className="text-yellow-400 font-semibold">{deleteWarning.activeInstances.length} etapa(s) ativa(s)</span>.
              Conclua ou cancele os itens abaixo antes de excluir:
            </p>

            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {deleteWarning.activeInstances.map((inst, i) => (
                <div key={i} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2 text-xs">
                  <div>
                    <span className="font-bold text-white">{inst.reference}</span>
                    {inst.title && <span className="text-zinc-400 ml-1">· {inst.title}</span>}
                  </div>
                  <div className="text-zinc-500 text-right">
                    <div>{inst.step_title}</div>
                    {inst.assignee_name && <div className="text-zinc-600">{inst.assignee_name}</div>}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setDeleteWarning(null)}
              className="w-full py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      <ItemNotesSheet item={notesItem} onClose={() => setNotesItem(null)} onNoteAdded={load} />
      <NewItemModal
        open={newItemOpen}
        templates={templates}
        onClose={() => setNewItemOpen(false)}
        onCreated={(tplId) => load(tplId)}
      />
    </div>
  );
}
