'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Mic, FileAudio, Clock, AlertTriangle, TrendingUp } from 'lucide-react';

interface AudioStats {
  receivers: number;
  segments: number;
  queued: number;
  transcriptions: number;
  pendingReviews: number;
}

export function AudioDashboardStats({ stats }: { stats: AudioStats }) {
  const cards = [
    {
      label: 'Receptores ativos',
      value: stats.receivers,
      icon: Mic,
      color: 'text-primary bg-primary/10',
    },
    {
      label: 'Segmentos capturados',
      value: stats.segments,
      icon: FileAudio,
      color: 'text-blue-500 bg-blue-500/10',
    },
    {
      label: 'Na fila (queued)',
      value: stats.queued,
      icon: Clock,
      color: 'text-amber-500 bg-amber-500/10',
    },
    {
      label: 'Transcrições',
      value: stats.transcriptions,
      icon: TrendingUp,
      color: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      label: 'Revisões pendentes',
      value: stats.pendingReviews,
      icon: AlertTriangle,
      color: stats.pendingReviews > 0 ? 'text-red-500 bg-red-500/10' : 'text-gray-500 bg-gray-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-[11px] text-muted-foreground">{card.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
