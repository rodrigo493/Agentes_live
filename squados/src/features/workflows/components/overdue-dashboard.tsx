'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Clock, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { listOverdueStepsAction } from '../actions/instance-actions';
import { sendWarningAction } from '../actions/warning-actions';

type Item = NonNullable<Awaited<ReturnType<typeof listOverdueStepsAction>>['items']>[number];

export function OverdueDashboard({ isMaster }: { isMaster: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [warnTarget, setWarnTarget] = useState<Item | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [warnMessage, setWarnMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSendWarning() {
    if (!warnTarget || !warnReason.trim()) return;
    setSending(true);
    const r = await sendWarningAction(warnTarget.step_id, warnReason, warnMessage);
    setSending(false);
    if (r.error) return toast.error(r.error);
    toast.success('Advertência enviada ao responsável');
    setWarnTarget(null); setWarnReason(''); setWarnMessage('');
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      const r = await listOverdueStepsAction();
      if (alive && r.items) setItems(r.items);
      setLoading(false);
    }
    load();
    const i = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(i); };
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>;

  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        🎉 Nenhum fluxo atrasado no momento.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div
          key={it.step_id}
          className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
            <div>
              <div className="font-semibold text-sm">
                {it.reference} {it.title && <span className="text-muted-foreground font-normal">· {it.title}</span>}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <Clock className="w-3 h-3" />
                Responsável: <strong>{it.assignee_name ?? 'sem responsável'}</strong> ·
                Atraso: <strong>{it.hours_overdue}h</strong>
              </div>
              {it.status === 'blocked' && (
                <div className="text-xs text-amber-600 mt-1">
                  🚧 Bloqueado: {it.block_reason_code}{it.block_reason_text ? ` — ${it.block_reason_text}` : ''}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">{it.status === 'blocked' ? 'Bloqueado' : 'Atrasado'}</Badge>
            {isMaster && (
              <Button size="sm" variant="outline" onClick={() => setWarnTarget(it)} className="gap-1">
                <Megaphone className="w-3.5 h-3.5" /> Advertir
              </Button>
            )}
          </div>
        </div>
      ))}

      <Dialog open={!!warnTarget} onOpenChange={(o) => !o && setWarnTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar advertência — {warnTarget?.reference}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Responsável: <strong>{warnTarget?.assignee_name ?? 'sem responsável'}</strong>
              {' · '}Atraso: <strong>{warnTarget?.hours_overdue}h</strong>
            </p>
            <div>
              <Label>Motivo *</Label>
              <Input
                value={warnReason} onChange={(e) => setWarnReason(e.target.value)}
                placeholder="Ex: Descumprimento de prazo sem justificativa"
              />
            </div>
            <div>
              <Label>Mensagem (opcional)</Label>
              <Textarea
                value={warnMessage} onChange={(e) => setWarnMessage(e.target.value)}
                rows={3}
                placeholder="Detalhe a exigência e o prazo para regularização…"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              A advertência chega no workspace do responsável pelo orquestrador e fica registrada
              permanentemente para auditoria.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setWarnTarget(null)}>Cancelar</Button>
              <Button onClick={handleSendWarning} disabled={sending || !warnReason.trim()}>
                {sending ? 'Enviando…' : 'Enviar advertência'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
