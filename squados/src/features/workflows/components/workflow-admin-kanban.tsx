'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Folder, Pencil, Play } from 'lucide-react';
import { getAdminKanbanAction } from '../actions/kanban-actions';
import { advanceWithNoteAction } from '../actions/pasta-actions';
import type { KanbanFlow } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import { KanbanBoard } from './workflow-kanban-board';
import { ItemNotesSheet } from './item-notes-sheet';
import { NewItemModal } from './new-item-modal';

interface Template { id: string; name: string; }

interface Props {
  templates: Template[];
  onNewFlow?: () => void;
  onEditFlow?: (templateId: string) => void;
  onStartFlow?: (templateId: string) => void;
}

export function AdminKanbanView({ templates, onNewFlow, onEditFlow, onStartFlow }: Props) {
  const [flows, setFlows] = useState<KanbanFlow[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesItem, setNotesItem] = useState<WorkItemView | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getAdminKanbanAction();
      if (r.flows) {
        setFlows(r.flows);
        setActiveTab((prev) => prev ?? (r.flows!.length > 0 ? r.flows![0].template_id : null));
      }
    } catch (err) {
      console.error('Falha ao carregar kanban admin:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleAdvance(stepId: string) {
    await advanceWithNoteAction(stepId);
    await load();
  }

  // Merge flows (têm dados de itens) com templates (lista completa)
  // Para mostrar todos os fluxos nas tabs mesmo sem itens ativos
  const allTabs = templates.map((t) => {
    const flow = flows.find((f) => f.template_id === t.id);
    return { id: t.id, name: t.name, flow: flow ?? null };
  });

  if (loading) {
    return <div className="text-sm text-zinc-500 py-12 text-center">Carregando…</div>;
  }

  const activeFlow = flows.find((f) => f.template_id === activeTab) ?? null;

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
                <Folder
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: isActive ? '#fbbf24' : color }}
                />
                {name}
                {overdueCount > 0 && (
                  <span className="bg-red-500 text-white rounded-full px-1.5 text-[9px] font-bold leading-4 ml-0.5">
                    {overdueCount}
                  </span>
                )}
              </button>
              {/* Ícones de ação (aparecem ao hover) */}
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
            onAdvance={handleAdvance}
            onOpenNotes={setNotesItem}
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

      <ItemNotesSheet
        item={notesItem}
        onClose={() => setNotesItem(null)}
        onNoteAdded={load}
      />

      <NewItemModal
        open={newItemOpen}
        templates={templates}
        onClose={() => setNewItemOpen(false)}
        onCreated={load}
      />
    </div>
  );
}
