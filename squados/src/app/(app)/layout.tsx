import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { AppShell } from '@/shared/components/layout/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getAuthenticatedUser();

  return <AppShell profile={profile}>{children}</AppShell>;
}
