'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, ArrowRight, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  createTemplateAction, updateTemplateAction,
  batchUpsertStepsAction, deleteTemplateStepAction,
} from '../actions/template-actions';
import type { WorkflowTemplateFull, WorkflowTemplateStep, Sector, Profile } from '@/shared/types/database';

interface Props {
  template: WorkflowTemplateFull | null;
  sectors: Sector[];
  users: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  open: boolean;
  onClose: () => void;
  onSaved: (t: WorkflowTemplateFull) => void;
}

type DraftStep = Partial<WorkflowTemplateStep> & {
  _tempKey: string;
  title: string;
  sla_hours: number;
  step_order: number;
  assignee_user_id: string | null;
  assignee_sector_id: string | null;
};

export function TemplateEditorModal({ template, sectors, users, open, onClose, onSaved }: Props) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [steps, setSteps] = useState<DraftStep[]>(() =>
    (template?.steps ?? []).map((s) => ({ ...s, _tempKey: s.id }))
  );
  const [saving, setSaving] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);

  function onDragStart(key: string) { setDragKey(key); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDrop(targetKey: string) {
    if (!dragKey || dragKey === targetKey) return;
    setSteps((p) => {
      const src = p.findIndex((s) => s._tempKey === dragKey);
      const dst = p.findIndex((s) => s._tempKey === targetKey);
      if (src < 0 || dst < 0) return p;
      const next = [...p];
      const [moved] = next.splice(src, 1);
      next.splice(dst, 0, moved);
      return next.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
    setDragKey(null);
  }

  function addStep() {
    setSteps((p) => [
      ...p,
      {
        _tempKey: `new-${Date.now()}`,
        title: '',
        sla_hours: 24,
        step_order: p.length + 1,
        assignee_user_id: null,
        assignee_sector_id: null,
        description: '',
      },
    ]);
  }

  function removeStep(key: string) {
    setSteps((p) => p.filter((s) => s._tempKey !== key).map((s, i) => ({ ...s, step_order: i + 1 })));
  }

  function move(key: string, dir: -1 | 1) {
    setSteps((p) => {
      const idx = p.findIndex((s) => s._tempKey === key);
      if (idx < 0) return p;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= p.length) return p;
      const next = [...p];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
  }

  async function handleSave() {
    if (!name.trim()) return toast.error('Informe o nome do fluxo');
    if (steps.length === 0) return toast.error('Adicione ao menos uma etapa');
    if (steps.some((s) => !s.title.trim())) return toast.error('Todas as etapas precisam de título');
    if (steps.some((s) => !s.assignee_user_id && !s.assignee_sector_id))
      return toast.error('Cada etapa precisa de responsável (usuário ou setor)');

    setSaving(true);
    try {
      let templateId = template?.id;
      if (templateId) {
        const r = await updateTemplateAction(templateId, { name, description: description || null });
        if (r.error) throw new Error(r.error);
      } else {
        const r = await createTemplateAction({ name, description });
        if (r.error || !r.template) throw new Error(r.error);
        templateId = r.template.id;
      }

      // Upsert steps em batch — trata conflito de step_order ao reordenar
      const r = await batchUpsertStepsAction(
        templateId,
        steps.map((s) => ({
          id: s.id,
          step_order: s.step_order,
          title: s.title,
          description: s.description ?? null,
          assignee_user_id: s.assignee_user_id,
          assignee_sector_id: s.assignee_sector_id,
          sla_hours: s.sla_hours,
        }))
      );
      if (r.error || !r.steps) throw new Error(r.error);
      const savedSteps = r.steps;

      // Delete removed steps (se edição)
      if (template) {
        const keptIds = new Set(savedSteps.map((s) => s.id));
        const deleteErrors: string[] = [];
        for (const s of template.steps) {
          if (!keptIds.has(s.id)) {
            const dr = await deleteTemplateStepAction(s.id);
            if (dr.error) deleteErrors.push(`"${s.title}": ${dr.error}`);
          }
        }
        if (deleteErrors.length > 0) {
          toast.warning(
            `Fluxo salvo, mas ${deleteErrors.length} etapa(s) não puderam ser excluídas pois há itens ativos em andamento. Conclua ou cancele os itens antes de remover etapas.`,
            { duration: 8000 }
          );
        }
      }

      onSaved({
        id: templateId!,
        name, description: description || null, color: 'violet', icon: null,
        is_active: true, created_by: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        steps: savedSteps,
      });
      toast.success('Fluxo salvo');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ maxWidth: '64rem', width: '95vw' }} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Editar Fluxo' : 'Novo Fluxo'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome do fluxo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: PA — Pedido de Acessório" />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Etapas do fluxo (em ordem)</Label>
              <Button size="sm" variant="outline" onClick={addStep} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar etapa
              </Button>
            </div>

            {steps.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhuma etapa ainda. Adicione a primeira.
              </p>
            )}

            {steps.length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/10">
                <div className="flex flex-wrap items-center gap-1">
                  {steps.map((s, i) => {
                    const assigneeUser = users.find(u => u.id === s.assignee_user_id);
                    const assigneeSector = sectors.find(x => x.id === s.assignee_sector_id);
                    const parts: string[] = [];
                    if (assigneeUser) parts.push(assigneeUser.full_name ?? '?');
                    if (assigneeSector) parts.push(assigneeSector.name ?? '?');
                    const label = parts.join(' + ') || '?';
                    return (
                      <div key={`prev-${s._tempKey}`} className="flex items-center gap-1">
                        <div className="px-2 py-1.5 rounded border bg-background text-[10px] w-[130px] space-y-0.5">
                          <div className="font-semibold truncate flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            {s.title || '(sem título)'}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground truncate">
                            {label}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            <span>SLA: {s.sla_hours}h</span>
                          </div>
                        </div>
                        {i < steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {steps.map((s, i) => (
              <div
                key={s._tempKey}
                draggable
                onDragStart={() => onDragStart(s._tempKey)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(s._tempKey)}
                className={`border rounded-lg p-3 space-y-2 bg-muted/20 ${dragKey === s._tempKey ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  <span className="text-xs font-mono bg-primary text-primary-foreground px-2 py-0.5 rounded">
                    {i + 1}
                  </span>
                  <Input
                    className="flex-1"
                    placeholder="Título da etapa (ex: Enviar PA para Pedidos)"
                    value={s.title}
                    onChange={(e) => setSteps((p) => p.map((x) => x._tempKey === s._tempKey ? { ...x, title: e.target.value } : x))}
                  />
                  <Button size="icon" variant="ghost" onClick={() => move(s._tempKey, -1)} disabled={i === 0}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => move(s._tempKey, 1)} disabled={i === steps.length - 1}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => removeStep(s._tempKey)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">Usuário responsável</Label>
                    <select
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                      value={s.assignee_user_id ?? ''}
                      onChange={(e) => setSteps((p) => p.map((x) => x._tempKey === s._tempKey ? { ...x, assignee_user_id: e.target.value || null } : x))}
                    >
                      <option value="">— nenhum —</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Setor responsável</Label>
                    <select
                      className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                      value={s.assignee_sector_id ?? ''}
                      onChange={(e) => setSteps((p) => p.map((x) => x._tempKey === s._tempKey ? { ...x, assignee_sector_id: e.target.value || null } : x))}
                    >
                      <option value="">— nenhum —</option>
                      {sectors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Pode combinar com usuário</p>
                  </div>
                  <div>
                    <Label className="text-[10px]">Prazo (horas)</Label>
                    <Input
                      type="number" min={1} step={1}
                      value={s.sla_hours}
                      onChange={(e) => setSteps((p) => p.map((x) => x._tempKey === s._tempKey ? { ...x, sla_hours: Number(e.target.value) || 24 } : x))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end border-t pt-4">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
