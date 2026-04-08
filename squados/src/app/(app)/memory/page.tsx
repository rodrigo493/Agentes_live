import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Brain,
  Building2,
  Target,
  Search,
  Clock,
  User,
  MessageSquare,
  Layers,
} from 'lucide-react';

const typeColors: Record<string, string> = {
  knowledge: 'bg-primary/10 text-primary',
  decision: 'bg-green-500/10 text-green-600',
  problem: 'bg-red-500/10 text-red-600',
  goal: 'bg-orange-500/10 text-orange-600',
};

const typeLabels: Record<string, string> = {
  knowledge: 'Conhecimento',
  decision: 'Decisao',
  problem: 'Problema',
  goal: 'Meta',
};

export default async function MemoryPage() {
  const { profile } = await getAuthenticatedUser();
  const admin = createAdminClient();

  // Query total memories
  const { count: totalMemories } = await admin
    .from('knowledge_memory')
    .select('id', { count: 'exact', head: true });

  // Query processed memories
  const { count: processedCount } = await admin
    .from('processed_memory')
    .select('id', { count: 'exact', head: true });

  // Query sectors covered
  const { data: sectorsCovered } = await admin
    .from('knowledge_memory')
    .select('sector_id')
    .not('sector_id', 'is', null);

  const uniqueSectors = new Set(sectorsCovered?.map((s) => s.sector_id) ?? []);

  // RAG readiness percentage
  const total = totalMemories ?? 0;
  const processed = processedCount ?? 0;
  const ragReadiness = total > 0 ? Math.round((processed / total) * 100) : 0;

  // Query recent memories with related data
  const { data: memories } = await admin
    .from('knowledge_memory')
    .select('id, content, memory_type, source, sector_id, user_id, created_at, sectors(name), profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(20);

  const stats = [
    {
      label: 'Total de memorias',
      value: total > 999 ? `${(total / 1000).toFixed(1)}k` : String(total),
      icon: Brain,
      iconColor: 'text-primary',
    },
    {
      label: 'Setores cobertos',
      value: String(uniqueSectors.size),
      icon: Layers,
      iconColor: 'text-blue-600',
    },
    {
      label: 'Prontidao RAG',
      value: `${ragReadiness}%`,
      icon: Target,
      iconColor: 'text-green-600',
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Memoria Operacional</h1>
        <p className="text-sm text-muted-foreground">
          Registro continuo de conhecimento, decisoes e contexto por setor
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar na memoria..." className="pl-9" />
        </div>
      </div>

      {/* Memory Entries */}
      <div className="space-y-3">
        {memories && memories.length > 0 ? (
          memories.map((entry) => {
            const memType = entry.memory_type ?? 'knowledge';
            const sectorName =
              (entry.sectors as unknown as { name: string } | null)?.name ?? 'Geral';
            const userName =
              (entry.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Sistema';

            return (
              <Card key={entry.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-5">
                  <p className="text-sm leading-relaxed mb-3">
                    {entry.content
                      ? entry.content.length > 200
                        ? `${entry.content.substring(0, 200)}...`
                        : entry.content
                      : 'Sem conteudo'}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      className={`text-[9px] ${typeColors[memType] ?? typeColors.knowledge}`}
                    >
                      {typeLabels[memType] ?? memType}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] gap-1">
                      <Building2 className="w-2.5 h-2.5" /> {sectorName}
                    </Badge>
                    {entry.source && (
                      <Badge variant="outline" className="text-[9px] gap-1">
                        <MessageSquare className="w-2.5 h-2.5" /> {entry.source}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-auto">
                      <User className="w-2.5 h-2.5" /> {userName}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />{' '}
                      {new Date(entry.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhuma memoria registrada ainda.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
