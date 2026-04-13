import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Factory,
  ArrowRight,
  Users,
  FileText,
  Brain,
  Bot,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { listTemplatesAction } from '@/features/workflows/actions/template-actions';
import { listMyInstancesAction } from '@/features/workflows/actions/instance-actions';
import { WorkflowShell } from '@/features/workflows/components/workflow-shell';
import { WorkflowFlowsView } from '@/features/workflows/components/workflow-flows-view';

// Fluxo produtivo LIVE: Pedido → Engenharia → Corte → Solda → Lavagem → Pintura → Montagem → Expedição
const PRODUCTION_FLOW = [
  { slug: 'comercial', label: 'Pedido', step: 1, color: 'bg-blue-500' },
  { slug: 'engenharia', label: 'Engenharia', step: 2, color: 'bg-indigo-500' },
  { slug: 'compras', label: 'Compras', step: 3, color: 'bg-purple-500' },
  { slug: 'solda', label: 'Solda', step: 4, color: 'bg-orange-500' },
  { slug: 'inspecao_qualidade_solda', label: 'Inspeção Solda', step: 5, color: 'bg-red-500' },
  { slug: 'lavagem', label: 'Lavagem', step: 6, color: 'bg-cyan-500' },
  { slug: 'pintura', label: 'Pintura', step: 7, color: 'bg-yellow-500' },
  { slug: 'inspecao_qualidade_pintura', label: 'Inspeção Pintura', step: 8, color: 'bg-red-400' },
  { slug: 'tapecaria', label: 'Tapeçaria', step: 9, color: 'bg-pink-500' },
  { slug: 'montagem', label: 'Montagem', step: 10, color: 'bg-green-500' },
  { slug: 'expedicao', label: 'Expedição', step: 11, color: 'bg-emerald-600' },
];

const SUPPORT_SECTORS = [
  { slug: 'financeiro', label: 'Financeiro' },
  { slug: 'contabil', label: 'Contábil' },
  { slug: 'rh', label: 'RH' },
  { slug: 'administrativo', label: 'Administrativo' },
  { slug: 'marketing', label: 'Marketing' },
  { slug: 'pos_venda', label: 'Pós-venda' },
  { slug: 'assistencia_tecnica', label: 'Assistência Técnica' },
];

export default async function OperationsPage() {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const isMaster = profile.role === 'master_admin';
  const admin = createAdminClient();

  const [{ templates = [] }, { instances = [] }, { data: allSectors }, { data: allUsers }] = await Promise.all([
    listTemplatesAction(),
    listMyInstancesAction(),
    admin.from('sectors').select('id, name, slug, icon, is_active').eq('is_active', true).order('name'),
    admin.from('profiles').select('id, full_name, sector_id').eq('status', 'active').is('deleted_at', null).order('full_name'),
  ]);

  // Buscar dados reais de cada setor
  const { data: sectors } = await admin
    .from('sectors')
    .select('id, name, slug, agent_id')
    .eq('is_active', true);

  const sectorMap = Object.fromEntries((sectors ?? []).map((s) => [s.slug, s]));

  // Contadores por setor
  const { data: userCounts } = await admin
    .from('profiles')
    .select('sector_id')
    .eq('status', 'active')
    .is('deleted_at', null);

  const { data: docCounts } = await admin
    .from('knowledge_docs')
    .select('sector_id')
    .eq('is_active', true);

  const { data: memCounts } = await admin
    .from('knowledge_memory')
    .select('sector_id')
    .eq('is_active', true);

  const users: Record<string, number> = {};
  const docs: Record<string, number> = {};
  const mems: Record<string, number> = {};

  (userCounts ?? []).forEach((u) => { if (u.sector_id) users[u.sector_id] = (users[u.sector_id] ?? 0) + 1; });
  (docCounts ?? []).forEach((d) => { if (d.sector_id) docs[d.sector_id] = (docs[d.sector_id] ?? 0) + 1; });
  (memCounts ?? []).forEach((m) => { if (m.sector_id) mems[m.sector_id] = (mems[m.sector_id] ?? 0) + 1; });

  function getSectorStats(slug: string) {
    const sector = sectorMap[slug];
    if (!sector) return { users: 0, docs: 0, mems: 0, hasAgent: false, id: '' };
    return {
      id: sector.id,
      users: users[sector.id] ?? 0,
      docs: docs[sector.id] ?? 0,
      mems: mems[sector.id] ?? 0,
      hasAgent: !!sector.agent_id,
    };
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Factory className="w-6 h-6 text-primary" />
          Operações da Fábrica
        </h1>
        <p className="text-sm text-muted-foreground">
          Fluxo produtivo LIVE: do pedido à expedição
        </p>
      </div>

      {/* Fluxos de Trabalho (substitui o antigo Fluxo Produtivo) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fluxos de Trabalho</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowFlowsView />
        </CardContent>
      </Card>

      {/* Status por Setor — Produtivo */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Setores Produtivos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {PRODUCTION_FLOW.map((step) => {
            const stats = getSectorStats(step.slug);
            return (
              <Card key={step.slug} className="hover:shadow-sm transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${step.color}`} />
                      <h3 className="text-sm font-semibold">{step.label}</h3>
                    </div>
                    <Badge
                      variant={stats.hasAgent ? 'default' : 'secondary'}
                      className="text-[9px]"
                    >
                      {stats.hasAgent ? 'Agente ativo' : 'Sem agente'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{stats.users}</p>
                      <p className="text-[9px] text-muted-foreground">Usuários</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{stats.docs}</p>
                      <p className="text-[9px] text-muted-foreground">Docs</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{stats.mems}</p>
                      <p className="text-[9px] text-muted-foreground">Memórias</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Setores de Suporte */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Setores de Suporte</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {SUPPORT_SECTORS.map((sector) => {
            const stats = getSectorStats(sector.slug);
            return (
              <Card key={sector.slug}>
                <CardContent className="p-3 text-center">
                  <p className="text-xs font-semibold">{sector.label}</p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">{stats.users}u</span>
                    <span className="text-[10px] text-muted-foreground">{stats.docs}d</span>
                    {stats.hasAgent && <Bot className="w-3 h-3 text-emerald-500" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Fluxos de Trabalho (Workflow Engine) */}
      <Card>
        <CardContent className="p-4">
          <WorkflowShell
            initialTemplates={templates}
            initialInstances={instances}
            sectors={(allSectors ?? []) as never}
            users={(allUsers ?? []) as never}
            isAdmin={isAdmin}
            isMaster={isMaster}
          />
        </CardContent>
      </Card>

      {/* Alertas */}
      {(() => {
        const sectorsWithoutKnowledge = PRODUCTION_FLOW.filter((s) => getSectorStats(s.slug).docs === 0);
        if (sectorsWithoutKnowledge.length === 0) return null;
        return (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  {sectorsWithoutKnowledge.length} setor{sectorsWithoutKnowledge.length > 1 ? 'es' : ''} produtivo{sectorsWithoutKnowledge.length > 1 ? 's' : ''} sem conhecimento
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {sectorsWithoutKnowledge.map((s) => s.label).join(', ')}
                  {' — '}importe SOPs e procedimentos para ativar os agentes desses setores.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
