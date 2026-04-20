'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
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
    return <div className="text-sm text-muted-foreground py-8 text-center">Carregando…</div>;
  }

  const activeFlow = flows.find((f) => f.template_id === activeTab) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Board Kanban</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={load}>
            <RefreshCw className="w-3 h-3" /> Atualizar
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setNewItemOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Novo Item
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Ativos', value: stats.total, color: 'text-blue-500' },
          { label: 'Atrasados', value: stats.overdue, color: 'text-red-500' },
          { label: 'Atenção', value: stats.warning, color: 'text-yellow-500' },
          { label: 'No prazo', value: stats.ok, color: 'text-emerald-500' },
        ].map((s) => (
          <div key={s.label} className="border rounded-xl p-3 bg-card text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {flows.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {flows.map((flow) => (
            <button
              key={flow.template_id}
              onClick={() => setActiveTab(flow.template_id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                activeTab === flow.template_id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: flow.template_color }}
              />
              {flow.template_name}
              {flow.overdue_count > 0 && (
                <span className="bg-red-500 text-white rounded-full px-1 text-[9px] font-bold">
                  {flow.overdue_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {activeFlow ? (
        <KanbanBoard
          flow={activeFlow}
          showAssignee={true}
          onAdvance={handleAdvance}
          onOpenNotes={setNotesItem}
        />
      ) : (
        <div className="border rounded-xl p-8 text-center text-sm text-muted-foreground">
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
