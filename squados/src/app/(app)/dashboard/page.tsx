import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  MessageSquare,
  Building2,
  Brain,
  TrendingUp,
  Activity,
  Clock,
  Bot,
  AlertTriangle,
} from 'lucide-react';

const recentActivity = [
  { user: 'Maria Silva', action: 'Enviou transcrição para Pintura', time: '2 min', sector: 'Pintura' },
  { user: 'Carlos Souza', action: 'Consultou agente de Solda', time: '5 min', sector: 'Solda' },
  { user: 'Ana Costa', action: 'Criou grupo Qualidade Q1', time: '12 min', sector: 'Qualidade' },
  { user: 'Pedro Lima', action: 'Upload de documento técnico', time: '18 min', sector: 'Engenharia' },
  { user: 'Fernanda Reis', action: 'Interação com agente Compras', time: '25 min', sector: 'Compras' },
];

const agentStatus = [
  { name: 'Agente Solda', status: 'online', queries: 45 },
  { name: 'Agente Pintura', status: 'online', queries: 32 },
  { name: 'Agente Compras', status: 'online', queries: 28 },
  { name: 'Agente RH', status: 'offline', queries: 0 },
  { name: 'Agente Engenharia', status: 'online', queries: 19 },
];

export default async function DashboardPage() {
  const { profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  const [
    { count: profileCount },
    { count: sectorCount },
    { count: messageCount },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('sectors').select('*', { count: 'exact', head: true }),
    admin.from('messages').select('*', { count: 'exact', head: true }),
  ]);

  const stats = [
    {
      label: 'Usuários ativos',
      value: String(profileCount ?? 0),
      icon: Users,
      trend: 'Total cadastrado',
      color: 'text-primary bg-primary/10',
    },
    {
      label: 'Mensagens',
      value: String(messageCount ?? 0),
      icon: MessageSquare,
      trend: 'Total registrado',
      color: 'text-blue-500 bg-blue-500/10',
    },
    {
      label: 'Setores ativos',
      value: String(sectorCount ?? 0),
      icon: Building2,
      trend: 'Todos operacionais',
      color: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      label: 'Memórias registradas',
      value: '0',
      icon: Brain,
      trend: 'Em breve',
      color: 'text-violet-500 bg-violet-500/10',
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Bem-vindo, {profile.full_name} — Visão geral do sistema Squad
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <Activity className="w-3 h-3 text-emerald-500" />
          Sistema operacional
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                      {stat.trend}
                    </p>
                  </div>
                  <div className={`p-2.5 rounded-lg ${stat.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity + Agent Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Atividade recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-primary">
                      {item.user.split(' ').map((n) => n[0]).join('')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.user}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.action}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                    {item.sector}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Agent Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              Status dos Agentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agentStatus.map((agent) => (
                <div key={agent.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        agent.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground'
                      }`}
                    />
                    <span className="text-sm font-medium">{agent.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{agent.queries} consultas</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">3 documentos pendentes de revisão no setor de Qualidade Solda</p>
            <p className="text-xs text-muted-foreground">Última atualização há 2 horas</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
