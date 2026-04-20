'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getUserKanbanAction } from '../actions/kanban-actions';
import { advanceWithNoteAction } from '../actions/pasta-actions';
import type { KanbanFlow } from '../actions/kanban-actions';
import type { WorkItemView } from '../actions/pasta-actions';
import { KanbanBoard } from './workflow-kanban-board';
import { ItemNotesSheet } from './item-notes-sheet';
import { NewItemModal } from './new-item-modal';

interface Template { id: string; name: string; }

interface Props { templates: Template[]; }

export function UserKanbanView({ templates }: Props) {
  const [flows, setFlows] = useState<KanbanFlow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notesItem, setNotesItem] = useState<WorkItemView | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getUserKanbanAction();
      if (r.flows) setFlows(r.flows);
      if (r.isAdmin !== undefined) setIsAdmin(r.isAdmin);
    } catch (err) {
      console.error('Falha ao carregar kanban:', err);
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
    return <div className="text-sm text-muted-foreground py-8 text-center">Carregando fluxos…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Meus Trabalhos</h2>
        {isAdmin && (
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setNewItemOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Novo Item
          </Button>
        )}
      </div>

      {flows.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-sm text-muted-foreground">
          {isAdmin
            ? 'Nenhum item ativo. Crie um novo item acima.'
            : 'Você não tem itens ativos no momento.'}
        </div>
      ) : (
        flows.map((flow) => (
          <div key={flow.template_id} className="border rounded-xl p-4 space-y-3 bg-card">
            <div className="flex items-center gap-2 flex-wrap">
              <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold text-sm">{flow.template_name}</span>
              {flow.overdue_count > 0 ? (
                <Badge variant="destructive" className="text-[10px]">
                  {flow.overdue_count} em atraso
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {flow.columns.reduce((acc, c) => acc + c.items.length, 0)} em andamento
                </Badge>
              )}
            </div>
            <KanbanBoard
              flow={flow}
              showAssignee={false}
              onAdvance={handleAdvance}
              onOpenNotes={setNotesItem}
            />
          </div>
        ))
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
