import { requirePermission } from '@/shared/lib/rbac/guards';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Settings2 } from 'lucide-react';

export default async function VisionEventsPage() {
  await requirePermission('vision_monitoring', 'read');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-primary" />
          Eventos de Visão
        </h1>
        <p className="text-sm text-muted-foreground">
          Detecções e fila de revisão humana obrigatória
        </p>
      </div>

      <Badge variant="outline" className="text-xs gap-1.5 px-3 py-1.5 border-amber-300 text-amber-700 bg-amber-50">
        <Settings2 className="w-3 h-3" /> Em preparação — pipeline de detecção ainda não ativado
      </Badge>

      <Card>
        <CardContent className="p-8 text-center text-muted-foreground space-y-2">
          <Shield className="w-10 h-10 mx-auto opacity-50" />
          <p className="text-sm font-medium">Nenhum evento detectado</p>
          <p className="text-xs">Quando o pipeline de visão computacional for ativado, eventos aparecerão aqui para revisão humana.</p>
          <div className="pt-3 text-[11px] space-y-1">
            <p>Tipos de detecção preparados:</p>
            <div className="flex flex-wrap gap-1.5 justify-center pt-1">
              {['EPI ausente', 'Desvio de processo', 'Risco de segurança', 'Anomalia de qualidade', 'Gargalo', 'Anomalia de equipamento', 'Área restrita', 'Desperdício'].map((t) => (
                <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
