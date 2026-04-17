'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { WorkItemView, StepNote } from '../actions/pasta-actions';
import { addNoteToStepAction } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView | null;
  onClose: () => void;
  onNoteAdded: () => void;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function ItemNotesSheet({ item, onClose, onNoteAdded }: Props) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!item || !note.trim()) return;
    setSaving(true);
    try {
      await addNoteToStepAction(item.step_id, note.trim());
      setNote('');
      onNoteAdded();
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setNote('');
    onClose();
  }

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            {item?.reference} — Diário de Bordo
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {/* Linha do tempo de notas */}
          {(item?.notes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma anotação ainda.</p>
          ) : (
            <div className="space-y-2">
              {(item?.notes ?? []).map((n: StepNote) => (
                <div key={`${n.author_id}-${n.created_at}`} className="border-l-2 border-border pl-3 py-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-primary">{n.step_title}</span>
                    <span className="text-[10px] text-muted-foreground">{fmtDate(n.created_at)}</span>
                    <span className="text-[10px] text-muted-foreground">· {n.author_name}</span>
                  </div>
                  <p className="text-sm">{n.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar nova nota */}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-semibold">Adicionar observação</p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Descreva o que foi feito nesta etapa…"
              rows={3}
              className="text-sm resize-none"
            />
            <Button
              size="sm"
              disabled={!note.trim() || saving}
              onClick={handleSave}
            >
              {saving ? 'Salvando…' : 'Salvar nota'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
