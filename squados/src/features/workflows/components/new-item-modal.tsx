'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createWorkItemAction } from '../actions/pasta-actions';

interface TemplateStep {
  id: string;
  step_order: number;
  title: string;
}

interface Template {
  id: string;
  name: string;
  steps?: TemplateStep[];
}

interface UserOption {
  id: string;
  full_name: string | null;
}

interface Props {
  open: boolean;
  templates: Template[];
  users?: UserOption[];
  onClose: () => void;
  onCreated: (templateId?: string) => void;
}

export function NewItemModal({ open, templates, users = [], onClose, onCreated }: Props) {
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [stepOrder, setStepOrder] = useState<number>(1);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const steps = selectedTemplate?.steps ?? [];

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    setStepOrder(1); // reset step when flow changes
  }

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
      start_step_order: stepOrder > 1 ? stepOrder : undefined,
      initial_note: note.trim() || undefined,
      assignee_id: assigneeId || null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const createdTemplateId = templateId;
    setReference('');
    setTitle('');
    setTemplateId('');
    setStepOrder(1);
    setAssigneeId('');
    setNote('');
    onCreated(createdTemplateId);
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
            <Select value={templateId} onValueChange={(v) => v && handleTemplateChange(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o fluxo…">
                  {templateId ? (selectedTemplate?.name ?? 'Selecione o fluxo…') : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {users.length > 0 && (
            <div className="space-y-1.5">
              <Label>Atribuir a</Label>
              <Select value={assigneeId || 'auto'} onValueChange={(v) => setAssigneeId(v === 'auto' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (responsável da etapa)</SelectItem>
                  {users
                    .slice()
                    .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name ?? '—'}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {steps.length > 0 && (
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select
                value={String(stepOrder)}
                onValueChange={(v) => setStepOrder(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {steps
                    .slice()
                    .sort((a, b) => a.step_order - b.step_order)
                    .map((s) => (
                      <SelectItem key={s.id} value={String(s.step_order)}>
                        {s.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
