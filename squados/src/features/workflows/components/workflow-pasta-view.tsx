'use client';

import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getPastaViewAction, advanceWithNoteAction } from '../actions/pasta-actions';
import type { PastaView, WorkItemView } from '../actions/pasta-actions';
import { WorkItemCard } from './work-item-card';
import { ItemNotesSheet } from './item-notes-sheet';
import { NewItemModal } from './new-item-modal';

interface Template {
  id: string;
  name: string;
}

interface Props {
  templates: Template[];
}

export function WorkflowPastaView({ templates }: Props) {
  const [pastas, setPastas] = useState<PastaView[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notesItem, setNotesItem] = useState<WorkItemView | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await getPastaViewAction();
    if (r.pastas) setPastas(r.pastas);
    if (r.isAdmin !== undefined) setIsAdmin(r.isAdmin);
    setLoading(false);
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Fluxos de Trabalho</h2>
        {isAdmin && (
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setNewItemOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Novo Item
          </Button>
        )}
      </div>

      {pastas.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
          {isAdmin
            ? 'Nenhum item ativo nos fluxos. Crie um novo item acima.'
            : 'Você não tem itens ativos no momento.'}
        </div>
      ) : (
        pastas.map((pasta) => {
          const overdueCount = pasta.items.filter(
            (i) => i.due_at && new Date(i.due_at).getTime() < Date.now()
          ).length;

          return (
            <div
              key={pasta.template_id}
              className="border rounded-xl p-4 space-y-3 bg-card"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="font-semibold text-sm">{pasta.template_name}</span>
                {overdueCount > 0 ? (
                  <Badge variant="destructive" className="text-[10px]">
                    {overdueCount} em atraso
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    {pasta.items.length} em andamento
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {pasta.items.map((item) => (
                  <WorkItemCard
                    key={item.step_id}
                    item={item}
                    onAdvance={handleAdvance}
                    onOpenNotes={setNotesItem}
                  />
                ))}
              </div>
            </div>
          );
        })
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
