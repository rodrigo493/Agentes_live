import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  Activity,
} from 'lucide-react';

const statusConfig: Record<
  string,
  { icon: typeof CheckCircle; color: string; bg: string; label: string }
> = {
  success: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-500/10', label: 'Sucesso' },
  denied: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-500/10', label: 'Negado' },
  failure: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-500/10', label: 'Falha' },
  warning: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-500/10', label: 'Alerta' },
};

export default async function AuditPage() {
  await requirePermission('audit', 'read');
  const admin = createAdminClient();

  // Query logs with user profiles
  const { data: logs } = await admin
    .from('audit_logs')
    .select('*, profiles!user_id(full_name, role)')
    .order('created_at', { ascending: false })
    .limit(100);

  // Count total events today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: totalEvents } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  // Count denied events today
  const { count: deniedCount } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString())
    .in('status', ['denied', 'failure']);

  // Count warnings today
  const { count: warningCount } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString())
    .eq('status', 'warning');

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Auditoria e Seguranca
        </h1>
        <p className="text-sm text-muted-foreground">
          Logs de acoes criticas, acessos e seguranca
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xl font-bold">{totalEvents ?? 0}</p>
              <p className="text-xs text-muted-foreground">Eventos hoje</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-xl font-bold">{deniedCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Acessos negados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <div>
              <p className="text-xl font-bold">{warningCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Alertas de seguranca</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar nos logs..." className="pl-9" />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Acao</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Usuario</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Perfil</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Modulo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">IP</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Hora</th>
                </tr>
              </thead>
              <tbody>
                {(logs ?? []).map((log) => {
                  const sc = statusConfig[log.status] ?? statusConfig.success;
                  const StatusIcon = sc.icon;
                  const userProfile = log.profiles as { full_name: string; role: string } | null;

                  return (
                    <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-3">
                        <div
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${sc.bg} ${sc.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {sc.label}
                        </div>
                      </td>
                      <td className="p-3 font-medium">{log.action}</td>
                      <td className="p-3">{userProfile?.full_name ?? 'Sistema'}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[9px]">
                          {userProfile?.role ?? log.resource_type ?? '-'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-[9px]">
                          {log.resource_type ?? '-'}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">
                        {log.ip_address ?? '-'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(log.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(!logs || logs.length === 0) && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum log registrado
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
