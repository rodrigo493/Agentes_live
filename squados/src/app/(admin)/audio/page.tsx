import { requirePermission } from '@/shared/lib/rbac/guards';
import { getAudioStatsAction } from '@/features/audio/actions/audio-receiver-actions';
import { AudioDashboardStats } from '@/features/audio/components/audio-dashboard-stats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mic, Radio, FileAudio, Shield, Settings2 } from 'lucide-react';
import Link from 'next/link';

export default async function AudioDashboardPage() {
  await requirePermission('audio_monitoring', 'read');
  const stats = await getAudioStatsAction();

  const sections = [
    {
      title: 'Receptores',
      description: 'Gerenciar dispositivos de captura por zona',
      href: '/audio/receivers',
      icon: Radio,
    },
    {
      title: 'Pipeline',
      description: 'Status de transcrição e classificação',
      href: '/audio/pipeline',
      icon: FileAudio,
    },
    {
      title: 'Revisão de Eventos',
      description: 'Fila de revisão humana obrigatória',
      href: '/audio/reviews',
      icon: Shield,
      badge: stats.pendingReviews > 0 ? stats.pendingReviews : null,
    },
    {
      title: 'LGPD',
      description: 'Retenção, anonimização e consentimento',
      href: '/audio/lgpd',
      icon: Settings2,
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mic className="w-6 h-6 text-primary" />
          Monitoramento de Áudio
        </h1>
        <p className="text-sm text-muted-foreground">
          Inteligência operacional, segurança e cultura — nunca punição automática
        </p>
      </div>

      <AudioDashboardStats stats={stats} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-lg bg-primary/10">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    {section.badge && (
                      <Badge variant="destructive" className="text-[10px]">
                        {section.badge}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{section.title}</h3>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-blue-700">Governança & Compliance</p>
            <p>Todos os eventos passam por revisão humana. Texto anonimizado por padrão (LGPD). Trilha de auditoria completa.</p>
            <p>Preparado para integração futura: ERP (Nomus), CNC/robôs, visão computacional.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
