import { requirePermission } from '@/shared/lib/rbac/guards';
import { getVisionStatsAction } from '@/features/vision/actions/vision-actions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, Camera, MapPin, AlertTriangle, Shield, Settings2, Layers } from 'lucide-react';
import Link from 'next/link';

export default async function VisionDashboardPage() {
  await requirePermission('vision_monitoring', 'read');
  const stats = await getVisionStatsAction();

  const statCards = [
    { label: 'Câmeras', value: stats.cameras, icon: Camera, color: 'text-primary bg-primary/10' },
    { label: 'Capturas', value: stats.captures, icon: Layers, color: 'text-blue-500 bg-blue-500/10' },
    { label: 'Eventos', value: stats.events, icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10' },
    { label: 'Revisões pendentes', value: stats.pendingReviews, icon: Shield, color: stats.pendingReviews > 0 ? 'text-red-500 bg-red-500/10' : 'text-gray-500 bg-gray-500/10' },
    { label: 'Zonas configuradas', value: stats.zones, icon: MapPin, color: 'text-emerald-500 bg-emerald-500/10' },
  ];

  const sections = [
    { title: 'Câmeras', description: 'Cadastro e gestão de câmeras por célula', href: '/vision/cameras', icon: Camera },
    { title: 'Zonas', description: 'Perfis de zona com EPIs e processos esperados', href: '/vision/zones', icon: MapPin },
    { title: 'Eventos', description: 'Detecções e fila de revisão humana', href: '/vision/events', icon: AlertTriangle, badge: stats.pendingReviews > 0 ? stats.pendingReviews : null },
    { title: 'LGPD', description: 'Retenção, blur facial e privacidade', href: '/vision/lgpd', icon: Settings2 },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Eye className="w-6 h-6 text-primary" />
          Visão Computacional
        </h1>
        <p className="text-sm text-muted-foreground">
          Processo, qualidade e segurança — fundação estrutural em preparação
        </p>
      </div>

      <Badge variant="outline" className="text-xs gap-1.5 px-3 py-1.5 border-amber-300 text-amber-700 bg-amber-50">
        <Settings2 className="w-3 h-3" /> Módulo em fase de fundação — sem pipeline ativo
      </Badge>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${card.color}`}><Icon className="w-4 h-4" /></div>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-lg bg-primary/10"><Icon className="w-5 h-5 text-primary" /></div>
                    {section.badge && <Badge variant="destructive" className="text-[10px]">{section.badge}</Badge>}
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
            <p className="font-medium text-blue-700">Governança & LGPD</p>
            <p>Sem reconhecimento facial. Blur de rostos e crachás por padrão. Revisão humana obrigatória para todos os eventos. Trilha de auditoria completa.</p>
            <p>Pontos de extensão preparados para: ERP (Nomus), CNC/robôs, modelos YOLO customizados, alertas executivos.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
