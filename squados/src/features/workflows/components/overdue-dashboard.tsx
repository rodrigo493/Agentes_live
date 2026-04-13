'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock } from 'lucide-react';
import { listOverdueStepsAction } from '../actions/instance-actions';

type Item = NonNullable<Awaited<ReturnType<typeof listOverdueStepsAction>>['items']>[number];

export function OverdueDashboard({ isMaster }: { isMaster: boolean }) {
  void isMaster;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

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
          <Badge variant="destructive">{it.status === 'blocked' ? 'Bloqueado' : 'Atrasado'}</Badge>
        </div>
      ))}
    </div>
  );
}
