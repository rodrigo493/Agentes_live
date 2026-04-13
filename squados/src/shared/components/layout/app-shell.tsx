'use client';

import { useState } from 'react';
import Image from 'next/image';
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
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Tarja preta superior — aparece em todas as páginas ── */}
      <header className="sticky top-0 z-50 h-14 bg-black flex items-center justify-center flex-shrink-0 shadow-md">
        <Image
          src="/live-squad.png"
          alt="Live Squad"
          width={220}
          height={40}
          className="h-9 w-auto object-contain"
          priority
        />
      </header>

      {/* ── Linha abaixo da tarja: sidebar + conteúdo ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar desktop — esconde no mobile */}
        <div className="hidden md:flex md:flex-shrink-0 sticky top-14 h-[calc(100vh-56px)]">
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
          {/* Header mobile com hamburguer (logo já está na tarja preta) */}
          <header className="md:hidden flex items-center gap-3 px-4 h-12 border-b border-border bg-[hsl(var(--sidebar-background))] sticky top-14 z-20">
            <button
              onClick={() => setMobileOpen(true)}
              className="text-[hsl(var(--sidebar-foreground))] p-1 rounded-md hover:bg-[hsl(var(--sidebar-accent))]"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-[hsl(var(--sidebar-foreground))]">Menu</span>
          </header>

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
