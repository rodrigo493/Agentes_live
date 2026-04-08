'use client';

import { Sidebar } from './sidebar';
import type { Profile } from '@/shared/types/database';
import { logoutAction } from '@/features/auth/actions/auth-actions';

interface AppShellProps {
  profile: Profile;
  children: React.ReactNode;
}

export function AppShell({ profile, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        userRole={profile.role}
        userName={profile.full_name}
        onLogout={() => logoutAction()}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
