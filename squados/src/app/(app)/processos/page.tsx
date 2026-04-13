import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ProcessCatalogShell } from '@/features/processes/components/process-catalog-shell';
import type { ProcessCatalogFull, ProcessCatalogMedia } from '@/shared/types/database';

export const metadata = { title: 'Processos' };

export default async function ProcessosPage() {
  const { profile } = await getAuthenticatedUser();
  const isAdmin = profile.role === 'admin' || profile.role === 'master_admin';
  if (!isAdmin) redirect('/dashboard');

  const admin = createAdminClient();

  const [catalogResult, sectorsResult] = await Promise.all([
    admin
      .from('process_catalog')
      .select('*, sectors(name, icon), process_catalog_media(*)')
      .eq('is_active', true)
      .order('title'),
    admin
      .from('sectors')
      .select('*')
      .eq('is_active', true)
      .order('name'),
  ]);

  const processes = (catalogResult.data ?? []).map((p) => ({
    ...p,
    sector_name: (p.sectors as { name: string } | null)?.name ?? null,
    sector_icon: (p.sectors as { icon: string } | null)?.icon ?? null,
    media: (p.process_catalog_media ?? []) as ProcessCatalogMedia[],
  })) as ProcessCatalogFull[];

  return (
    <ProcessCatalogShell
      initialProcesses={processes}
      sectors={sectorsResult.data ?? []}
      isAdmin={isAdmin}
    />
  );
}
