import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { getProblems } from '@/features/problemas-producao/actions/problemas-actions';
import { ProblemasShell } from '@/features/problemas-producao/components/problemas-shell';

export default async function ProblemasProducaoPage() {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';

  const { problems = [] } = await getProblems();

  return <ProblemasShell initialProblems={problems} isAdmin={isAdmin} />;
}
