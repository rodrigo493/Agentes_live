'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertOctagon, Clock, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/shared/lib/supabase/client';
import { getMyInboxAction } from '../actions/inbox-actions';
import { completeStepAction, blockStepAction, listBlockReasonsAction } from '../actions/instance-actions';
import type { WorkflowInboxItem, WorkflowBlockReason } from '@/shared/types/database';

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function overdue(item: WorkflowInboxItem) {
  return item.status !== 'done' && new Date(item.due_at).getTime() < Date.now();
}

export function WorkflowInbox() {
  const [items, setItems] = useState<WorkflowInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<WorkflowBlockReason[]>([]);
  const [blockItem, setBlockItem] = useState<WorkflowInboxItem | null>(null);
  const [blockCode, setBlockCode] = useState('');
  const [blockText, setBlockText] = useState('');

  async function load() {
    const r = await getMyInboxAction();
    if (r.items) setItems(r.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    listBlockReasonsAction().then((r) => r.reasons && setReasons(r.reasons));

    const supabase = createClient();

    const channel = supabase
      .channel('workflow-inbox-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workflow_inbox_items' },
        () => { load(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleComplete(item: WorkflowInboxItem) {
    if (!confirm('Concluir e repassar para a próxima etapa?')) return;
    const r = await completeStepAction(item.workflow_step_id);
    if (r.error) return toast.error(r.error);
    toast.success(r.next_step_id ? 'Etapa concluída e repassada' : 'Fluxo concluído');
    load();
  }

  async function handleBlock() {
    if (!blockItem || !blockCode) return;
    const r = await blockStepAction(blockItem.workflow_step_id, blockCode, blockText);
    if (r.error) return toast.error(r.error);
    toast.success('Etapa marcada como bloqueada');
    setBlockItem(null); setBlockCode(''); setBlockText('');
    load();
  }

  if (loading) return <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>;

  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhuma tarefa pendente</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((it) => {
        const isLate = overdue(it);
        const isBlocked = it.status === 'blocked';
        return (
          <div
            key={it.id}
            className={`border rounded-lg p-3 flex items-start justify-between gap-3 ${
              isLate ? 'border-destructive/40 bg-destructive/5' : isBlocked ? 'border-amber-400/40 bg-amber-400/5' : ''
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{it.title}</span>
                {isLate && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                {isBlocked && <Badge variant="secondary" className="text-[10px] bg-amber-500 text-white">Bloqueado</Badge>}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1 flex-wrap">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Recebida: {fmt(it.received_at)}</span>
                <span>Prazo: {fmt(it.due_at)}</span>
                <span>Repasse: {fmt(it.handoff_target_at)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setBlockItem(it)} className="gap-1">
                <AlertOctagon className="w-3.5 h-3.5" /> Bloquear
              </Button>
              <Button size="sm" onClick={() => handleComplete(it)} className="gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Concluir e repassar
              </Button>
            </div>
          </div>
        );
      })}

      <Dialog open={!!blockItem} onOpenChange={(o) => !o && setBlockItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Motivo</Label>
              <select
                className="w-full h-9 text-sm rounded-md border border-input bg-background px-2"
                value={blockCode} onChange={(e) => setBlockCode(e.target.value)}
              >
                <option value="">— selecione —</option>
                {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Detalhes (opcional)</Label>
              <Textarea rows={3} value={blockText} onChange={(e) => setBlockText(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBlockItem(null)}>Cancelar</Button>
              <Button onClick={handleBlock} disabled={!blockCode}>Confirmar bloqueio</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
