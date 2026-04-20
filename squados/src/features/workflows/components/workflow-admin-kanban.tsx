'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAdminKanbanAction } from '../actions/kanban-actions';
import { advanceWithNoteAction } from '../actions/pasta-actions';
import type { KanbanFlow, KanbanStats } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import { KanbanBoard } from './workflow-kanban-board';
import { ItemNotesSheet } from './item-notes-sheet';
import { NewItemModal } from './new-item-modal';

interface Template { id: string; name: string; }

interface Props { templates: Template[]; }

export function AdminKanbanView({ templates }: Props) {
  const [flows, setFlows] = useState<KanbanFlow[]>([]);
  const [stats, setStats] = useState<KanbanStats>({ total: 0, overdue: 0, warning: 0, ok: 0 });
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
      if (r.stats) setStats(r.stats);
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

  if (loading) {
    return <div className="text-sm text-zinc-500 py-12 text-center">Carregando…</div>;
  }

  const activeFlow = flows.find((f) => f.template_id === activeTab) ?? null;

  const statCards = [
    { label: 'Ativos', value: stats.total, color: 'text-blue-400' },
    { label: 'Atrasados', value: stats.overdue, color: 'text-red-400' },
    { label: 'Atenção', value: stats.warning, color: 'text-yellow-400' },
    { label: 'No prazo', value: stats.ok, color: 'text-emerald-400' },
  ];

  return (
    <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">Board Kanban</h2>
          <p className="text-[11px] text-zinc-500">Admin vê tudo — Usuário vê só o seu</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
            onClick={load}
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white border-0"
            onClick={() => setNewItemOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Novo Item
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-center">
            <div className={`text-3xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Flow tabs */}
      {flows.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {flows.map((flow) => (
            <button
              key={flow.template_id}
              onClick={() => setActiveTab(flow.template_id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                activeTab === flow.template_id
                  ? 'bg-zinc-700 text-white border-zinc-600'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-zinc-200'
              }`}
            >
              <Folder
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: flow.template_color }}
              />
              {flow.template_name}
              {flow.overdue_count > 0 && (
                <span className="bg-red-500 text-white rounded-full px-1.5 text-[9px] font-bold leading-4">
                  {flow.overdue_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Board */}
      {activeFlow ? (
        <KanbanBoard
          flow={activeFlow}
          showAssignee={true}
          onAdvance={handleAdvance}
          onOpenNotes={setNotesItem}
        />
      ) : (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-10 text-center text-sm text-zinc-500">
          Nenhum fluxo ativo. Crie um fluxo e inicie um item para visualizar o board.
        </div>
      )}

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
