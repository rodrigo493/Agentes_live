import { requirePermission } from '@/shared/lib/rbac/guards';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Settings2, Eye, EyeOff } from 'lucide-react';

export default async function VisionLgpdPage() {
  await requirePermission('vision_monitoring', 'manage');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          LGPD — Visão Computacional
        </h1>
        <p className="text-sm text-muted-foreground">
          Privacidade, retenção e anonimização de dados visuais
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold">Padrões LGPD Ativos</h3>
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Blur de rostos</span><Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Ativo</Badge></div>
              <div className="flex justify-between"><span>Blur de crachás</span><Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Ativo</Badge></div>
              <div className="flex justify-between"><span>Armazenar frames brutos</span><Badge className="bg-gray-100 text-gray-800 text-[10px]">Desativado</Badge></div>
              <div className="flex justify-between"><span>Retenção de capturas</span><span className="font-medium">7 dias</span></div>
              <div className="flex justify-between"><span>Retenção de eventos</span><span className="font-medium">90 dias</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold">Princípios de Governança</h3>
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>Sem reconhecimento facial na v1</li>
              <li>Toda detecção requer revisão humana</li>
              <li>Nenhuma punição automática</li>
              <li>Foco: processo, qualidade e segurança</li>
              <li>Proporcionalidade na coleta</li>
              <li>Trilha de auditoria completa</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Badge variant="outline" className="text-xs gap-1.5 px-3 py-1.5 border-amber-300 text-amber-700 bg-amber-50">
        <Settings2 className="w-3 h-3" /> Configuração editável será ativada junto com o pipeline
      </Badge>
    </div>
  );
}
