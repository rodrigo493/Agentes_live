import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  Brain,
  Building2,
  TrendingUp,
  Search,
  Clock,
} from 'lucide-react';

export default async function KnowledgePage() {
  const { profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Query documents with count
  const { data: docs, count: docsCount } = await admin
    .from('knowledge_docs')
    .select('id, title, doc_type, category, sector_id, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(10);

  // Query memories count
  const { count: memoriesCount } = await admin
    .from('knowledge_memory')
    .select('id', { count: 'exact', head: true });

  // Query sectors for maturity data
  const { data: sectors } = await admin
    .from('sectors')
    .select('id, name')
    .order('name');

  // Count docs per sector
  const sectorMaturity = await Promise.all(
    (sectors ?? []).slice(0, 8).map(async (sector) => {
      const { count: sectorDocs } = await admin
        .from('knowledge_docs')
        .select('id', { count: 'exact', head: true })
        .eq('sector_id', sector.id);

      const { count: sectorMemories } = await admin
        .from('knowledge_memory')
        .select('id', { count: 'exact', head: true })
        .eq('sector_id', sector.id);

      const docCount = sectorDocs ?? 0;
      const memCount = sectorMemories ?? 0;
      const total = docCount + memCount;
      const progress = total > 0 ? Math.min(100, Math.round((total / 50) * 100)) : 0;

      return { name: sector.name, docs: docCount, memories: memCount, progress };
    })
  );

  // Count weekly ingestions (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: weeklyIngestions } = await admin
    .from('knowledge_docs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', weekAgo.toISOString());

  const totalDocs = docsCount ?? 0;
  const totalMemories = memoriesCount ?? 0;
  const totalSectors = sectors?.length ?? 0;
  const weeklyCount = weeklyIngestions ?? 0;

  const stats = [
    { label: 'Total de documentos', value: String(totalDocs), icon: FileText, bgColor: 'bg-primary/10', iconColor: 'text-primary' },
    { label: 'Memorias acumuladas', value: totalMemories > 999 ? `${(totalMemories / 1000).toFixed(1)}k` : String(totalMemories), icon: Brain, bgColor: 'bg-green-500/10', iconColor: 'text-green-600' },
    { label: 'Setores indexados', value: `${totalSectors}`, icon: Building2, bgColor: 'bg-blue-500/10', iconColor: 'text-blue-600' },
    { label: 'Ingestoes esta semana', value: String(weeklyCount), icon: TrendingUp, bgColor: 'bg-orange-500/10', iconColor: 'text-orange-600' },
  ];

  const statusLabel = (status: string | null) => {
    if (status === 'processed') return 'Processado';
    if (status === 'processing') return 'Processando...';
    return 'Pendente';
  };

  const statusVariant = (status: string | null): 'default' | 'secondary' | 'outline' => {
    if (status === 'processed') return 'default';
    if (status === 'processing') return 'secondary';
    return 'outline';
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Base de Conhecimento</h1>
        <p className="text-sm text-muted-foreground">
          Repositorio centralizado de documentos e memoria operacional
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.bgColor}`}>
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar na base de conhecimento..." className="pl-9" />
      </div>

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Ingestions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Ingestoes Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {docs && docs.length > 0 ? (
              docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {doc.category ?? doc.doc_type} &middot;{' '}
                        {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={statusVariant(doc.status)}
                    className="text-[9px] flex-shrink-0"
                  >
                    {statusLabel(doc.status)}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum documento ingerido ainda.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Sector Maturity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              Maturidade por Setor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sectorMaturity.length > 0 ? (
              sectorMaturity.map((s, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.docs} docs &middot; {s.memories} mem
                    </span>
                  </div>
                  <Progress value={s.progress} className="h-2" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum setor cadastrado ainda.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
