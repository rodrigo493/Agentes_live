import { requirePermission } from '@/shared/lib/rbac/guards';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ROLE_PERMISSIONS = [
  { role: 'master_admin', label: 'Master Admin', permissions: 'Acesso total ao sistema' },
  { role: 'admin', label: 'Admin', permissions: 'Gestão de usuários, setores, grupos, auditoria' },
  { role: 'manager', label: 'Manager', permissions: 'Gestão do setor, relatórios' },
  { role: 'operator', label: 'Operador', permissions: 'Chat com agente, workspace, conhecimento' },
  { role: 'viewer', label: 'Visualizador', permissions: 'Dashboard e workspace (somente leitura)' },
];

export default async function PermissionsPage() {
  await requirePermission('users', 'manage');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Permissões</h1>

      <Card>
        <CardHeader>
          <CardTitle>Matriz de Permissões por Cargo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">Cargo</th>
                  <th className="p-3 text-left font-medium">Permissões</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_PERMISSIONS.map((rp) => (
                  <tr key={rp.role} className="border-b">
                    <td className="p-3 font-medium capitalize">{rp.label}</td>
                    <td className="p-3 text-muted-foreground">{rp.permissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
