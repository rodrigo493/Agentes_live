'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Clock, TrendingUp, AlertOctagon, Megaphone, CheckCircle2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getBlockAnalyticsAction,
  getWorkflowKpisAction,
  type BlockAnalyticsRow,
  type WorkflowKpis,
} from '../actions/analytics-actions';

function exportAnalyticsCsv(rows: BlockAnalyticsRow[]) {
  const header = ['Código', 'Motivo', 'Categoria', 'Setor', 'Ocorrências', 'Média Horas Bloqueado'];
  const data = rows.map((r) => [
    `"${r.code}"`,
    `"${r.label}"`,
    `"${r.category}"`,
    `"${r.sector_name ?? 'Todos'}"`,
    String(r.occurrences),
    String(r.avg_hours_blocked?.toFixed(1) ?? ''),
  ]);
  const csv = [header.join(','), ...data.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-bloqueios-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BlockAnalytics() {
  const [rows, setRows] = useState<BlockAnalyticsRow[]>([]);
  const [kpis, setKpis] = useState<WorkflowKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [a, k] = await Promise.all([getBlockAnalyticsAction(), getWorkflowKpisAction()]);
      if (!alive) return;
      if (a.rows) setRows(a.rows);
      if (k.kpis) setKpis(k.kpis);
      setLoading(false);
    }
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground py-4 text-center">Carregando analytics…</div>;

  const total = rows.reduce((s, r) => s + r.occurrences, 0);

  if (total === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        Nenhum bloqueio registrado nos últimos 30 dias.
      </div>
    );
  }
  const byCode: Record<string, { label: string; occurrences: number }> = {};
  for (const r of rows) {
    const k = r.code;
    if (!byCode[k]) byCode[k] = { label: r.label, occurrences: 0 };
    byCode[k].occurrences += r.occurrences;
  }
  const topReasons = Object.entries(byCode)
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 6);

  return (
    <div className="space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Iniciados 30d" value={kpis.instances_started} />
          <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} label="Concluídos 30d" value={kpis.instances_completed} color="text-emerald-600" />
          <KpiCard icon={<Clock className="w-4 h-4" />} label="Atrasados agora" value={kpis.steps_overdue_now} color="text-destructive" />
          <KpiCard icon={<AlertOctagon className="w-4 h-4" />} label="Bloqueados agora" value={kpis.steps_blocked_now} color="text-amber-600" />
          <KpiCard icon={<Megaphone className="w-4 h-4" />} label="Advertências 30d" value={kpis.warnings_sent} />
          <KpiCard icon={<Clock className="w-4 h-4" />} label="Média/etapa (h)" value={kpis.avg_step_hours ?? '—'} />
        </div>
      )}

      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Top motivos de bloqueio (30 dias)
          </h3>
          <Button size="sm" variant="outline" onClick={() => exportAnalyticsCsv(rows)} className="gap-1">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </Button>
        </div>
        {total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhum bloqueio registrado nos últimos 30 dias.
          </p>
        ) : (
          <div className="space-y-2">
            {topReasons.map((r) => {
              const pct = Math.round((r.occurrences / total) * 100);
              return (
                <div key={r.code}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground">{r.occurrences} · {pct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rows.some((r) => r.sector_name) && (
        <div className="border rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold">Bloqueios por setor</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b">
                  <th className="pb-1 font-medium">Setor</th>
                  <th className="pb-1 font-medium">Motivo</th>
                  <th className="pb-1 font-medium text-right">Ocorrências</th>
                  <th className="pb-1 font-medium text-right">Média bloqueio</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1">{r.sector_name ?? '—'}</td>
                    <td className="py-1">{r.label}</td>
                    <td className="py-1 text-right">{r.occurrences}</td>
                    <td className="py-1 text-right">
                      {r.avg_hours_blocked != null ? `${r.avg_hours_blocked}h` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: number | string; color?: string }) {
  return (
    <div className="border rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className={`text-xl font-bold ${color ?? ''}`}>{value}</div>
    </div>
  );
}
