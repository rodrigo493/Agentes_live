import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Crown,
  BarChart3,
  Brain,
  Shield,
  ShieldCheck,
  Target,
  Activity,
  TrendingUp,
  ArrowDown,
  ArrowRight,
  FileText,
  MessageSquare,
  Zap,
  Building2,
  Bot,
} from 'lucide-react';

const AGENT_ICONS: Record<string, typeof Crown> = {
  crown: Crown,
  shield: Shield,
  'shield-check': ShieldCheck,
  target: Target,
  activity: Activity,
  'trending-up': TrendingUp,
};

const TIER_LABELS: Record<string, string> = {
  c_level: 'C-Level',
  conselheiro: 'Conselheiro',
  governanca: 'Governança',
};

export default async function ExecutivePage() {
  const { profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Fetch executive agents (hierarchy_level may not exist yet)
  const { data: agents } = await admin
    .from('agents')
    .select('id, name, display_name, type, description, config, access_level, context_policy, status, metadata')
    .in('type', ['executive', 'governance'])
    .eq('status', 'active')
    .order('name');

  // Fetch hierarchy (table may not exist yet)
  let hierarchy: any[] = [];
  try {
    const { data: h } = await admin
      .from('agent_hierarchy')
      .select('parent_agent_id, child_agent_id, relationship_type');
    hierarchy = h ?? [];
  } catch { /* table doesn't exist yet */ }

  // Fetch sectors with counts
  const { data: sectors } = await admin
    .from('sectors')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name');

  const { data: docCounts } = await admin
    .from('knowledge_docs')
    .select('sector_id')
    .eq('is_active', true);

  const { data: memoryCounts } = await admin
    .from('processed_memory')
    .select('sector_id')
    .eq('is_active', true)
    .eq('processing_status', 'completed');

  const { data: knowledgeCounts } = await admin
    .from('knowledge_memory')
    .select('sector_id')
    .eq('is_active', true);

  // Fetch recent agent communications (table may not exist yet)
  let recentComms: any[] = [];
  try {
    const { data: comms } = await admin
      .from('agent_communications')
      .select('id, from_agent_id, to_agent_id, communication_type, subject, priority, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    recentComms = comms ?? [];
  } catch { /* table doesn't exist yet */ }

  // Fetch specialist agents (sector agents)
  const { data: specialistAgents } = await admin
    .from('agents')
    .select('id, name, display_name, sector_id, status')
    .eq('type', 'specialist')
    .eq('status', 'active');

  // Build count maps
  const docsPerSector: Record<string, number> = {};
  const memoryPerSector: Record<string, number> = {};
  const knowledgePerSector: Record<string, number> = {};

  (docCounts ?? []).forEach((d) => {
    if (d.sector_id) docsPerSector[d.sector_id] = (docsPerSector[d.sector_id] ?? 0) + 1;
  });
  (memoryCounts ?? []).forEach((m) => {
    if (m.sector_id) memoryPerSector[m.sector_id] = (memoryPerSector[m.sector_id] ?? 0) + 1;
  });
  (knowledgeCounts ?? []).forEach((k) => {
    if (k.sector_id) knowledgePerSector[k.sector_id] = (knowledgePerSector[k.sector_id] ?? 0) + 1;
  });

  const executiveAgents = agents ?? [];
  const agentMap = Object.fromEntries(executiveAgents.map((a) => [a.id, a]));

  // Organize by tier
  const ceo = executiveAgents.find((a) => a.name === 'agente_ceo');
  const presidente = executiveAgents.find((a) => a.name === 'agente_presidente');
  const conselheiros = executiveAgents.filter((a) => (a.metadata as any)?.tier === 'conselheiro');
  const governanca = executiveAgents.find((a) => a.name === 'agente_governanca');

  const totalDocs = Object.values(docsPerSector).reduce((a, b) => a + b, 0);
  const totalMemory = Object.values(memoryPerSector).reduce((a, b) => a + b, 0);
  const totalKnowledge = Object.values(knowledgePerSector).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Painel Executivo
          </h1>
          <p className="text-sm text-muted-foreground">
            Arquitetura multiagente para tomada de decisão estratégica
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Bot className="w-3 h-3" />
            {executiveAgents.length} agentes executivos
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <Building2 className="w-3 h-3" />
            {(sectors ?? []).length} setores
          </Badge>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <FileText className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalDocs}</p>
                <p className="text-xs text-muted-foreground">Documentos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Brain className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalMemory}</p>
                <p className="text-xs text-muted-foreground">Memórias Processadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Zap className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalKnowledge}</p>
                <p className="text-xs text-muted-foreground">Conhecimentos Validados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <MessageSquare className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{recentComms.length}</p>
                <p className="text-xs text-muted-foreground">Comunicações entre Agentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Hierarchy Visualization */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" /> Hierarquia de Agentes Executivos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tier 0: Sector Specialists */}
          <div className="p-4 rounded-lg bg-muted/30 border border-dashed border-border">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Agentes Especialistas de Setor
              </span>
              <Badge variant="secondary" className="text-[9px]">
                {(specialistAgents ?? []).length} ativos · {(sectors ?? []).length} setores
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {(sectors ?? []).map((sector) => {
                const docs = docsPerSector[sector.id] ?? 0;
                const mem = memoryPerSector[sector.id] ?? 0;
                return (
                  <div
                    key={sector.id}
                    className="px-3 py-2 rounded-md bg-background border border-border text-xs"
                  >
                    <span className="font-medium">{sector.name}</span>
                    <span className="text-muted-foreground ml-2">
                      {docs}d · {mem}m
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Arrow down */}
          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Tier 1: CEO */}
          {ceo && (
            <AgentCard
              agent={ceo}
              subtitle="Consolida memórias de todos os setores"
              size="lg"
            />
          )}

          {/* Arrow down */}
          <div className="flex justify-center">
            <ArrowDown className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Tier 2: Presidente */}
          {presidente && (
            <AgentCard
              agent={presidente}
              subtitle="Interpreta e distribui para conselheiros"
              size="lg"
            />
          )}

          {/* Arrow down */}
          <div className="flex justify-center items-center gap-2">
            <ArrowDown className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">distribui análises</span>
            <ArrowDown className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Tier 3: Conselheiros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {conselheiros.map((agent) => (
              <AgentCard key={agent.id} agent={agent} size="sm" />
            ))}
          </div>

          {/* Governance */}
          {governanca && (
            <>
              <div className="flex justify-center items-center gap-2">
                <ArrowDown className="w-5 h-5 text-muted-foreground rotate-180" />
                <span className="text-[10px] text-muted-foreground">valida governança</span>
                <ArrowDown className="w-5 h-5 text-muted-foreground rotate-180" />
              </div>
              <AgentCard
                agent={governanca}
                subtitle="Alinha decisões com governança corporativa"
                size="md"
              />
            </>
          )}

          {/* Flow description */}
          <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="text-xs font-semibold text-primary mb-2">Fluxo de Decisão</h4>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[9px]">Especialistas</Badge>
              <ArrowRight className="w-3 h-3" />
              <Badge variant="outline" className="text-[9px]">CEO</Badge>
              <ArrowRight className="w-3 h-3" />
              <Badge variant="outline" className="text-[9px]">Presidente</Badge>
              <ArrowRight className="w-3 h-3" />
              <Badge variant="outline" className="text-[9px]">Conselheiros</Badge>
              <ArrowRight className="w-3 h-3" />
              <Badge variant="outline" className="text-[9px]">Governança</Badge>
              <ArrowRight className="w-3 h-3" />
              <Badge variant="outline" className="text-[9px]">Presidente</Badge>
              <span className="text-[10px]">(visão 360°)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sector Knowledge Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Base de Conhecimento por Setor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {(sectors ?? []).map((sector) => {
              const docs = docsPerSector[sector.id] ?? 0;
              const mem = memoryPerSector[sector.id] ?? 0;
              const know = knowledgePerSector[sector.id] ?? 0;
              const total = docs + mem + know;

              return (
                <div
                  key={sector.id}
                  className="p-3 rounded-lg border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold truncate">{sector.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-sm font-bold">{docs}</p>
                      <p className="text-[9px] text-muted-foreground">docs</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold">{mem}</p>
                      <p className="text-[9px] text-muted-foreground">mem</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold">{know}</p>
                      <p className="text-[9px] text-muted-foreground">valid</p>
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (total / 20) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Communications */}
      {recentComms.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Comunicações Recentes entre Agentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentComms.map((comm) => {
                const from = agentMap[comm.from_agent_id];
                const to = agentMap[comm.to_agent_id];
                return (
                  <div key={comm.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 text-xs">
                    <Badge variant="outline" className="text-[9px]">
                      {from?.display_name ?? 'Agente'}
                    </Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <Badge variant="outline" className="text-[9px]">
                      {to?.display_name ?? 'Agente'}
                    </Badge>
                    <span className="flex-1 truncate text-muted-foreground">{comm.subject}</span>
                    <Badge
                      variant={comm.priority === 'critical' ? 'destructive' : 'secondary'}
                      className="text-[9px]"
                    >
                      {comm.priority}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Agent Card Component
function AgentCard({
  agent,
  subtitle,
  size = 'md',
}: {
  agent: any;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const meta = (agent.metadata ?? {}) as Record<string, any>;
  const iconName = meta.icon ?? 'bot';
  const color = meta.color ?? '#6366f1';
  const tier = meta.tier ?? agent.type;
  const Icon = AGENT_ICONS[iconName] ?? Bot;
  const config = (agent.config ?? {}) as Record<string, any>;
  const domain = config.domain;

  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
  };

  return (
    <div
      className={`rounded-lg border-2 ${sizeClasses[size]}`}
      style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-lg flex-shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={`font-semibold ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
              {agent.display_name}
            </h4>
            <Badge
              variant="outline"
              className="text-[9px]"
              style={{ borderColor: `${color}40`, color }}
            >
              {TIER_LABELS[tier] ?? tier}
            </Badge>
            {domain && (
              <Badge variant="secondary" className="text-[9px]">
                {domain}
              </Badge>
            )}
          </div>
          <p className={`text-muted-foreground mt-1 ${size === 'sm' ? 'text-[10px] line-clamp-2' : 'text-xs'}`}>
            {subtitle ?? agent.description}
          </p>
          {size !== 'sm' && config.analysis_focus && (
            <div className="flex flex-wrap gap-1 mt-2">
              {(config.analysis_focus as string[]).slice(0, 4).map((focus: string) => (
                <span
                  key={focus}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-background border border-border"
                >
                  {focus.replace(/_/g, ' ')}
                </span>
              ))}
              {(config.analysis_focus as string[]).length > 4 && (
                <span className="text-[9px] text-muted-foreground">
                  +{(config.analysis_focus as string[]).length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
