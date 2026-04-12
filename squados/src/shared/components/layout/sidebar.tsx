'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useDesktopNotifications } from '@/features/notifications/hooks/use-desktop-notifications';
import type { UserRole } from '@/shared/types/database';
import { getNavItemsForRole } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { SectorSwitcher } from '@/features/auth/components/sector-switcher';

interface SidebarProps {
  userRole: UserRole;
  userName: string;
  userSectors: { id: string; name: string; icon: string | null }[];
  activeSector: { id: string; name: string; icon: string | null } | null;
  onLogout: () => void;
  onClose?: () => void; // fecha o drawer no mobile
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function Sidebar({ userRole, userName, userSectors, activeSector, onLogout, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const navItems = getNavItemsForRole(userRole);
  const { requestPermission } = useDesktopNotifications();
  const [permission, setPermission] = useState<string>('unsupported');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const handleEnableNotifications = async () => {
    const result = await requestPermission();
    setPermission(result);
  };

  return (
    <aside
      className={cn(
        'flex flex-col bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] border-r border-[hsl(var(--sidebar-border))] transition-all duration-300 h-screen sticky top-0 z-30',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[hsl(var(--sidebar-border))]">
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--sidebar-primary))] flex items-center justify-center flex-shrink-0">
          <span className="text-[hsl(var(--sidebar-primary-foreground))] font-bold text-sm">S</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-base font-bold text-[hsl(var(--sidebar-primary-foreground))] truncate">Squad</h1>
            <p className="text-[10px] text-[hsl(var(--sidebar-muted))] truncate">LiveUni Platform</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-md'
                  : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User + collapse */}
      <div className="border-t border-[hsl(var(--sidebar-border))] p-3 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[hsl(var(--sidebar-accent))] flex items-center justify-center">
              <span className="text-xs font-semibold text-[hsl(var(--sidebar-accent-foreground))]">
                {getInitials(userName)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-[10px] text-[hsl(var(--sidebar-muted))] truncate capitalize">
                {userRole.replace('_', ' ')}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))] transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Sector switcher — só exibe se o usuário tem 2+ setores */}
        {userSectors.length >= 2 && (
          <SectorSwitcher
            sectors={userSectors}
            activeSector={activeSector}
            collapsed={collapsed}
          />
        )}

        {permission === 'default' && !collapsed && (
          <button
            onClick={handleEnableNotifications}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))] text-xs"
            title="Ativar notificações"
          >
            <Bell className="w-4 h-4 flex-shrink-0" />
            <span>Ativar notificações</span>
          </button>
        )}
        {permission === 'default' && collapsed && (
          <button
            onClick={handleEnableNotifications}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))]"
            title="Ativar notificações"
          >
            <Bell className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex w-full items-center justify-center p-2 rounded-lg hover:bg-[hsl(var(--sidebar-accent))] transition-colors text-[hsl(var(--sidebar-muted))]"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
