'use client';

import { Sidebar } from './sidebar';
import type { Profile } from '@/shared/types/database';
import { logoutAction } from '@/features/auth/actions/auth-actions';

interface Sector {
  id: string;
  name: string;
  icon: string | null;
}

interface AppShellProps {
  profile: Profile;
  userSectors: Sector[];
  activeSector: Sector | null;
  children: React.ReactNode;
}

export function AppShell({ profile, userSectors, activeSector, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        userRole={profile.role}
        userName={profile.full_name}
        userSectors={userSectors}
        activeSector={activeSector}
        onLogout={() => logoutAction()}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
