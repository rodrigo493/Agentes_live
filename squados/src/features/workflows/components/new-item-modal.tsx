'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createWorkItemAction } from '../actions/pasta-actions';

interface Template {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  templates: Template[];
  onClose: () => void;
  onCreated: () => void;
}

export function NewItemModal({ open, templates, onClose, onCreated }: Props) {
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!reference.trim() || !title.trim() || !templateId) {
      setError('Referência, título e fluxo são obrigatórios.');
      return;
    }
    setSaving(true);
    setError('');
    const result = await createWorkItemAction({
      reference: reference.trim(),
      title: title.trim(),
      template_id: templateId,
      initial_note: note.trim() || undefined,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReference('');
    setTitle('');
    setTemplateId('');
    setNote('');
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Item de Trabalho</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reference">Referência</Label>
            <Input
              id="reference"
              placeholder="PA.0234"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Título / Descrição</Label>
            <Textarea
              id="title"
              placeholder="Descreva o item de trabalho…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Fluxo de destino</Label>
            <Select value={templateId} onValueChange={(value) => value && setTemplateId(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o fluxo…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Observação inicial (opcional)</Label>
            <Textarea
              id="note"
              placeholder="Contexto ou detalhes para o primeiro responsável…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={saving} onClick={handleCreate}>
              {saving ? 'Criando…' : 'Criar item'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
