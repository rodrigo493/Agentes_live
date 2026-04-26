import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { redirect } from 'next/navigation';
import { FabricaShell } from '@/features/fabrica/components/fabrica-shell';

export default async function FabricaPage() {
  const { profile } = await getAuthenticatedUser();
  const isAllowed =
    profile.role === 'admin' ||
    profile.role === 'master_admin' ||
    profile.role === 'operator';
  if (!isAllowed) redirect('/dashboard');
  return <FabricaShell />;
}
