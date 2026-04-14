'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getOverdueByWeekAction, type OverdueByWeek } from '../actions/analytics-actions';

export function OverdueTimelineChart() {
  const [rows, setRows] = useState<OverdueByWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOverdueByWeekAction().then((r) => {
      if (r.rows) setRows(r.rows);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>;
  if (rows.length === 0) return <div className="text-sm text-muted-foreground py-6 text-center">Sem dados de atraso nas últimas 12 semanas.</div>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Etapas em atraso por semana (últimas 12 semanas)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="week_label"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(v) => [v, 'Etapas atrasadas']}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
