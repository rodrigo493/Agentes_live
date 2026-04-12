'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop — esconde no mobile */}
      <div className="hidden md:flex md:flex-shrink-0 sticky top-0 h-screen">
        <Sidebar
          userRole={profile.role}
          userName={profile.full_name}
          userSectors={userSectors}
          activeSector={activeSector}
          onLogout={() => logoutAction()}
        />
      </div>

      {/* Drawer mobile */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <div className="h-full">
            <Sidebar
              userRole={profile.role}
              userName={profile.full_name}
              userSectors={userSectors}
              activeSector={activeSector}
              onLogout={() => logoutAction()}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Conteúdo principal */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header mobile com hamburguer */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-[hsl(var(--sidebar-background))] sticky top-0 z-20">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-[hsl(var(--sidebar-foreground))] p-1 rounded-md hover:bg-[hsl(var(--sidebar-accent))]"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[hsl(var(--sidebar-primary))] flex items-center justify-center">
              <span className="text-[hsl(var(--sidebar-primary-foreground))] font-bold text-xs">S</span>
            </div>
            <span className="font-semibold text-sm text-[hsl(var(--sidebar-primary-foreground))]">SquadOS</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
