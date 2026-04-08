import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, HardHat, ShieldCheck, AlertTriangle } from 'lucide-react';

const ZONE_TYPE_LABELS: Record<string, string> = {
  production: 'Produção',
  quality: 'Qualidade',
  logistics: 'Logística',
  safety: 'Segurança',
  restricted: 'Restrita',
  common: 'Comum',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

export default async function ZonesPage() {
  await requirePermission('vision_monitoring', 'read');
  const admin = createAdminClient();

  const { data: zones } = await admin
    .from('vision_zone_profiles')
    .select('*, sectors(name)')
    .eq('is_active', true)
    .order('zone_name');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="w-6 h-6 text-primary" />
          Perfis de Zona
        </h1>
        <p className="text-sm text-muted-foreground">
          Configuração de EPIs, processos esperados e nível de risco por zona
        </p>
      </div>

      {(zones ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma zona configurada ainda.</p>
            <p className="text-xs mt-1">Zonas serão configuradas quando o pipeline de visão for ativado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(zones ?? []).map((zone: any) => (
            <Card key={zone.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold">{zone.zone_name}</h3>
                  <Badge className={`text-[10px] ${RISK_COLORS[zone.risk_level] ?? ''}`}>
                    {zone.risk_level}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{ZONE_TYPE_LABELS[zone.zone_type] ?? zone.zone_type}</Badge>
                  <span className="text-[10px] text-muted-foreground">{zone.sectors?.name}</span>
                </div>
                {zone.required_epi?.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <HardHat className="w-3 h-3 text-muted-foreground" />
                    {zone.required_epi.map((epi: string) => (
                      <Badge key={epi} variant="secondary" className="text-[9px]">{epi}</Badge>
                    ))}
                  </div>
                )}
                {zone.expected_process && (
                  <p className="text-xs text-muted-foreground">{zone.expected_process}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
