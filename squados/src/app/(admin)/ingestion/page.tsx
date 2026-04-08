import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function IngestionPage() {
  await requirePermission('users', 'manage');
  const admin = createAdminClient();

  const { count: docsCount } = await admin
    .from('knowledge_docs')
    .select('*', { count: 'exact', head: true });

  const { count: memoriesCount } = await admin
    .from('knowledge_memory')
    .select('*', { count: 'exact', head: true });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Ingestão de Conhecimento</h1>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{docsCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Memórias de Conhecimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{memoriesCount ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Upload de documentos será implementado em breve.
        </CardContent>
      </Card>
    </div>
  );
}
