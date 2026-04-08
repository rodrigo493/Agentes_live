import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { SectorManagement } from '@/features/sectors/components/sector-management';

export default async function SectorsPage() {
  await requirePermission('sectors', 'read');

  const admin = createAdminClient();

  const { data: sectors } = await admin
    .from('sectors')
    .select('id, name, slug, description, area, icon, agents!fk_sectors_agent(name, display_name, status)')
    .order('name');

  // Fetch counts per sector
  const sectorIds = (sectors ?? []).map((s) => s.id);

  const { data: docCounts } = await admin
    .from('knowledge_docs')
    .select('sector_id')
    .eq('is_active', true)
    .in('sector_id', sectorIds.length > 0 ? sectorIds : ['__none__']);

  const { data: memoryCounts } = await admin
    .from('processed_memory')
    .select('sector_id')
    .eq('is_active', true)
    .in('sector_id', sectorIds.length > 0 ? sectorIds : ['__none__']);

  const { data: userCounts } = await admin
    .from('profiles')
    .select('sector_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .in('sector_id', sectorIds.length > 0 ? sectorIds : ['__none__']);

  // Fetch all active users for sector assignment
  const { data: allUsers } = await admin
    .from('profiles')
    .select('id, full_name, email, role, sector_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('full_name');

  // Build count maps
  const docs: Record<string, number> = {};
  const memories: Record<string, number> = {};
  const users: Record<string, number> = {};

  (docCounts ?? []).forEach((d) => {
    if (d.sector_id) docs[d.sector_id] = (docs[d.sector_id] ?? 0) + 1;
  });
  (memoryCounts ?? []).forEach((m) => {
    if (m.sector_id) memories[m.sector_id] = (memories[m.sector_id] ?? 0) + 1;
  });
  (userCounts ?? []).forEach((u) => {
    if (u.sector_id) users[u.sector_id] = (users[u.sector_id] ?? 0) + 1;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Setores</h1>
        <p className="text-sm text-muted-foreground">
          {(sectors ?? []).length} setores cadastrados
        </p>
      </div>

      <SectorManagement
        sectors={(sectors ?? []) as any}
        docCounts={docs}
        memoryCounts={memories}
        userCounts={users}
        allUsers={(allUsers ?? []) as any}
      />
    </div>
  );
}
