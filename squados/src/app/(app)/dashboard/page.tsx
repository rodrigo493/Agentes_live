import Link from 'next/link';
import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { getAllUsersTaskStatsAction } from '@/features/production/actions/task-actions';
import { getProblemRanking } from '@/features/problemas-producao/actions/problemas-actions';
import { ProblemasRankingKpi } from '@/features/problemas-producao/components/problemas-ranking-kpi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
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
  ShieldAlert,
  Workflow,
  CheckCircle2,
  AlertCircle,
  UserX,
  ExternalLink,
} from 'lucide-react';

export default async function DashboardPage() {
  const { profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Verificar setor do usuário para regras especiais
  const effectiveSectorId = profile.active_sector_id ?? profile.sector_id;
  let userSectorSlug: string | null = null;
  if (effectiveSectorId) {
    const { data: sectorData } = await admin
      .from('sectors')
      .select('slug')
      .eq('id', effectiveSectorId)
      .single();
    userSectorSlug = sectorData?.slug ?? null;
  }

  const isPresidente = userSectorSlug === 'presidencia';
  const isCeo = userSectorSlug === 'ceo';
  const isExecutive = isPresidente || isCeo || userSectorSlug === 'governanca' || userSectorSlug === 'conselho';

  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  const [
    { count: profileCount },
    { count: sectorCount },
    { count: messageCount },
    taskStats,
    problemRankingResult,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('sectors').select('*', { count: 'exact', head: true }),
    admin.from('messages').select('*', { count: 'exact', head: true }),
    isAdmin ? getAllUsersTaskStatsAction() : Promise.resolve({ totalTasks: 0, totalCompleted: 0, totalOverdue: 0, usersWithNoTasks: 0, stats: undefined }),
    (isPresidente || isCeo || isAdmin) ? getProblemRanking() : Promise.resolve({ ranking: [] }),
  ]);
  const problemRanking = problemRankingResult.ranking ?? [];

  // Buscar alertas do Maestro (para Presidente e CEO)
  let maestroAlerts: any[] = [];
  if (isPresidente || isCeo) {
    try {
      const { data } = await admin
        .from('maestro_alerts')
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(10);
      maestroAlerts = data ?? [];
    } catch {
      // Tabela pode não existir ainda
    }
  }

  // Buscar atividade real do audit_log
  let recentActivity: any[] = [];
  try {
    const { data: auditData } = await admin
      .from('audit_log')
      .select('id, user_id, action, resource_type, details, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (auditData && auditData.length > 0) {
      const userIds = [...new Set(auditData.map((a) => a.user_id).filter(Boolean))];
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds.length > 0 ? userIds : ['__none__']);
      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

      recentActivity = auditData.map((a) => ({
        user: profileMap[a.user_id ?? ''] ?? 'Sistema',
        action: `${a.action} ${a.resource_type}`,
        time: getRelativeTime(a.created_at),
        sector: (a.details as any)?.sector_name ?? a.resource_type,
      }));
    }
  } catch {
    // fallback se audit_log não existir
  }

  // Buscar status real dos agentes
  let agentStatus: any[] = [];
  try {
    const { data: agents } = await admin
      .from('agents')
      .select('id, display_name, status, type')
      .eq('status', 'active')
      .order('display_name')
      .limit(8);

    if (agents) {
      // Contar mensagens por agente (últimas 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      for (const agent of agents) {
        const { count } = await admin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_type', 'agent')
          .gte('created_at', oneDayAgo)
          .contains('metadata', { agent_id: agent.id } as any);

        agentStatus.push({
          name: agent.display_name,
          status: 'online',
          queries: count ?? 0,
          type: agent.type,
        });
      }
    }
  } catch {
    // fallback
  }

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

  const unreadAlerts = maestroAlerts.filter((a) => !a.is_read);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ALERTA MAESTRO — Tarja vermelha para Presidente/CEO */}
      {(isPresidente || isCeo) && unreadAlerts.length > 0 && (
        <Card className="border-red-500 bg-red-500/10 border-2 animate-pulse">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-700">
                  ALERTA MAESTRO — {unreadAlerts.length} alerta{unreadAlerts.length > 1 ? 's' : ''} detectado{unreadAlerts.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-red-600">
                  O Agente Maestro detectou conversas que podem ir contra a missão, visão e cultura da empresa
                </p>
              </div>
            </div>
            {unreadAlerts.map((alert) => (
              <div key={alert.id} className="rounded-lg bg-red-500/10 border border-red-300 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-[10px]">
                      {alert.severity === 'critical' ? 'CRÍTICO' : 'ALTO'}
                    </Badge>
                    <span className="text-xs font-medium text-red-700">
                      {alert.sector_name} — {alert.user_name}
                    </span>
                  </div>
                  <span className="text-[10px] text-red-500">
                    {getRelativeTime(alert.created_at)}
                  </span>
                </div>
                <p className="text-sm text-red-800 font-medium">{alert.alert_content}</p>
                {alert.original_message && (
                  <p className="text-xs text-red-600 italic border-l-2 border-red-400 pl-2 mt-1">
                    &ldquo;{alert.original_message.substring(0, 200)}{alert.original_message.length > 200 ? '...' : ''}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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

      {/* ── Ranking Problemas de Produção (CEO / admin) ── */}
      {(isPresidente || isCeo || isAdmin) && (
        <ProblemasRankingKpi ranking={problemRanking} />
      )}

      {/* ── Produção: Stats de Tarefas (apenas admin) ── */}
      {isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Produção — Tarefas de Hoje</h2>
          </div>

          {/* 4 stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total de tarefas</p>
                    <p className="text-2xl font-bold">{taskStats.totalTasks}</p>
                    <p className="text-[10px] text-muted-foreground">agendadas hoje</p>
                  </div>
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Workflow className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Concluídas</p>
                    <p className="text-2xl font-bold text-emerald-600">{taskStats.totalCompleted}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {taskStats.totalTasks > 0
                        ? `${Math.round((taskStats.totalCompleted / taskStats.totalTasks) * 100)}% do total`
                        : 'sem tarefas'}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Atrasadas</p>
                    <p className="text-2xl font-bold text-rose-600">{taskStats.totalOverdue}</p>
                    <p className="text-[10px] text-muted-foreground">necessitam atenção</p>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Sem tarefas</p>
                    <p className="text-2xl font-bold text-amber-600">{taskStats.usersWithNoTasks}</p>
                    <p className="text-[10px] text-muted-foreground">usuário{taskStats.usersWithNoTasks !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <UserX className="w-4 h-4 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Por usuário */}
          {taskStats.stats && taskStats.stats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Status por usuário
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {taskStats.stats
                    .sort((a, b) => b.overdueToday - a.overdueToday || b.totalToday - a.totalToday)
                    .map((s) => {
                      const pct = s.totalToday > 0 ? Math.round((s.completedToday / s.totalToday) * 100) : 0;
                      return (
                        <Link
                          key={s.userId}
                          href={`/producao/usuario/${s.userId}`}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                        >
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.fullName} />}
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                              {s.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-sm font-medium truncate">{s.fullName}</p>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {s.overdueToday > 0 && (
                                  <Badge variant="destructive" className="text-[10px] px-1.5">
                                    {s.overdueToday} atrasada{s.overdueToday > 1 ? 's' : ''}
                                  </Badge>
                                )}
                                {s.totalToday === 0 && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5">sem tarefas</Badge>
                                )}
                                {s.totalToday > 0 && s.completedToday === s.totalToday && (
                                  <Badge className="text-[10px] px-1.5 bg-emerald-500">✓ tudo feito</Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground">
                                  {s.completedToday}/{s.totalToday}
                                </span>
                              </div>
                            </div>
                            {s.totalToday > 0 && (
                              <Progress value={pct} className="h-1.5" />
                            )}
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </Link>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
              {recentActivity.length > 0 ? (
                recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {item.user.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
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
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma atividade recente</p>
              )}
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
              {agentStatus.length > 0 ? (
                agentStatus.map((agent) => (
                  <div key={agent.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-sm font-medium">{agent.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{agent.queries} consultas</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Carregando agentes...</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}
