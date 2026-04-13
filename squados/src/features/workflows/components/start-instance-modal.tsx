'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { startInstanceAction } from '../actions/instance-actions';
import type { WorkflowTemplateFull } from '@/shared/types/database';

interface Props {
  template: WorkflowTemplateFull;
  open: boolean;
  onClose: () => void;
  onStarted: () => void;
}

export function StartInstanceModal({ template, open, onClose, onStarted }: Props) {
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleStart() {
    if (!reference.trim()) return toast.error('Informe a referência (ex: PA-2026-0042)');
    setSaving(true);
    const r = await startInstanceAction({
      template_id: template.id,
      reference: reference.trim(),
      title: title.trim() || undefined,
    });
    setSaving(false);
    if (r.error) return toast.error(r.error);
    onStarted();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Iniciar: {template.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Referência *</Label>
            <Input
              value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="PA-2026-0042"
            />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Cliente X / 5 peças"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Ao iniciar, a primeira etapa é atribuída ao responsável configurado e ele recebe aviso do orquestrador.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleStart} disabled={saving}>
              {saving ? 'Iniciando…' : 'Iniciar fluxo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
