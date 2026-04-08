import { requireRole } from '@/shared/lib/rbac/guards';
import { AppShell } from '@/shared/components/layout/app-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole('admin');

  return <AppShell profile={profile}>{children}</AppShell>;
}
