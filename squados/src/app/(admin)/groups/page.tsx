import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';

export default async function GroupsAdminPage() {
  await requirePermission('users', 'manage');
  const admin = createAdminClient();

  const { data: groups } = await admin
    .from('groups')
    .select('id, name, description, status, created_at')
    .order('created_at', { ascending: false });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Gestão de Grupos</h1>

      {groups && groups.length > 0 ? (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Nome</th>
                <th className="p-3 text-left font-medium">Descrição</th>
                <th className="p-3 text-left font-medium">Status</th>
                <th className="p-3 text-left font-medium">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b">
                  <td className="p-3 font-medium">{g.name}</td>
                  <td className="p-3 text-muted-foreground">{g.description ?? '-'}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      g.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {g.status}
                    </span>
                  </td>
                  <td className="p-3">{new Date(g.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum grupo criado ainda.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
