import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Factory, AlertTriangle, Bot } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { WorkflowShell } from '@/features/workflows/components/workflow-shell';
import { WorkflowFlowsView } from '@/features/workflows/components/workflow-flows-view';
import type { WorkflowTemplateFull, WorkflowTemplateStep, Sector, Profile } from '@/shared/types/database';

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

  const [{ data: allSectors }, { data: templatesRaw }, { data: usersRaw }] = await Promise.all([
    admin.from('sectors').select('id, name, slug, agent_id, icon, is_active, created_at, updated_at').eq('is_active', true).order('name'),
    admin.from('workflow_templates').select('*, workflow_template_steps(*)').eq('is_active', true).order('name'),
    admin.from('profiles').select('id, full_name, sector_id').eq('status', 'active').is('deleted_at', null),
  ]);

  const templates = (templatesRaw ?? []).map((t) => ({
    ...t,
    steps: ((t.workflow_template_steps ?? []) as WorkflowTemplateStep[])
      .sort((a, b) => a.step_order - b.step_order),
  })) as WorkflowTemplateFull[];

  const sectorMap = Object.fromEntries((allSectors ?? []).map((s) => [s.slug, s]));

  const { data: userCounts } = await admin
    .from('profiles')
    .select('sector_id')
    .eq('status', 'active')
    .is('deleted_at', null);

  const { data: docCounts } = await admin
    .from('knowledge_docs')
    .select('sector_id')
    .eq('is_active', true);

  const users: Record<string, number> = {};
  const docs: Record<string, number> = {};

  (userCounts ?? []).forEach((u) => { if (u.sector_id) users[u.sector_id] = (users[u.sector_id] ?? 0) + 1; });
  (docCounts ?? []).forEach((d) => { if (d.sector_id) docs[d.sector_id] = (docs[d.sector_id] ?? 0) + 1; });

  function getSectorStats(slug: string) {
    const sector = sectorMap[slug];
    if (!sector) return { users: 0, docs: 0, hasAgent: false, id: '' };
    return {
      id: sector.id,
      users: users[sector.id] ?? 0,
      docs: docs[sector.id] ?? 0,
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

      {/* Gerenciamento de fluxos — admin */}
      {isAdmin && (
        <WorkflowShell
          initialTemplates={templates}
          initialInstances={[]}
          sectors={(allSectors ?? []) as Sector[]}
          users={(usersRaw ?? []) as Pick<Profile, 'id' | 'full_name' | 'sector_id'>[]}
          isAdmin={isAdmin}
          isMaster={isMaster}
        />
      )}

      {/* Fluxos de trabalho — usuários não-admin que participam de etapas */}
      {!isAdmin && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold">Fluxos de Trabalho</h2>
          <WorkflowFlowsView />
        </div>
      )}

      {/* Setores Produtivos — compacto */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Setores Produtivos</h2>
        <div className="flex flex-wrap gap-2">
          {PRODUCTION_FLOW.map((step) => {
            const stats = getSectorStats(step.slug);
            return (
              <div
                key={step.slug}
                className="flex items-center gap-1.5 bg-muted/40 border rounded-full px-3 py-1 text-xs"
              >
                <span className={`w-2 h-2 rounded-full ${step.color} flex-shrink-0`} />
                <span className="font-medium">{step.label}</span>
                <span className="text-muted-foreground">{stats.users}u</span>
                {stats.hasAgent && <Bot className="w-3 h-3 text-emerald-500" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Setores de Suporte */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Setores de Suporte</h2>
        <div className="flex flex-wrap gap-2">
          {SUPPORT_SECTORS.map((sector) => {
            const stats = getSectorStats(sector.slug);
            return (
              <div key={sector.slug} className="bg-muted/30 border rounded px-2.5 py-1 text-xs text-muted-foreground">
                {sector.label}
                {stats.hasAgent && <Bot className="w-3 h-3 text-emerald-500 inline ml-1" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerta: setores sem conhecimento */}
      {(() => {
        const withoutKnowledge = PRODUCTION_FLOW.filter((s) => getSectorStats(s.slug).docs === 0);
        if (withoutKnowledge.length === 0) return null;
        return (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  {withoutKnowledge.length} setor{withoutKnowledge.length > 1 ? 'es' : ''} produtivo{withoutKnowledge.length > 1 ? 's' : ''} sem conhecimento
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {withoutKnowledge.map((s) => s.label).join(', ')}
                  {' — '}importe SOPs e procedimentos para ativar os agentes.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
