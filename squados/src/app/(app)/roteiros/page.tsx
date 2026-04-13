import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { RoteirosShell } from '@/features/roteiros/components/roteiros-shell';
import type { Sector } from '@/shared/types/database';

export const metadata = { title: 'Roteiros' };

export default async function RoteirosPage() {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  const admin = createAdminClient();
  const { data: sectors } = await admin
    .from('sectors')
    .select('*')
    .eq('is_active', true)
    .order('name');

  return <RoteirosShell sectors={(sectors ?? []) as Sector[]} isAdmin={isAdmin} />;
}
