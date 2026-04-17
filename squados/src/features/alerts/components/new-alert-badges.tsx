'use client';

import Link from 'next/link';
import { AlertTriangle, Mail, MessageSquare, Workflow } from 'lucide-react';
import { useNewAlerts } from '../hooks/use-new-alerts';
import { useOverdueAlert } from '../hooks/use-overdue-alert';

export function NewAlertBadges() {
  const alerts = useNewAlerts();
  const { hasOverdue } = useOverdueAlert();

  const badges = [
    hasOverdue && {
      key: 'atraso',
      href: '/producao',
      label: 'ATRASO',
      Icon: AlertTriangle,
      color: 'border-red-500/80 text-red-400',
      pulse: 'animate-badge-pulse-red',
    },
    alerts.email && {
      key: 'email',
      href: '/email',
      label: 'EMAIL',
      Icon: Mail,
      color: 'border-amber-400/80 text-amber-400',
      pulse: 'animate-badge-pulse-amber',
    },
    alerts.message && {
      key: 'mensagem',
      href: '/workspace',
      label: 'MENSAGEM',
      Icon: MessageSquare,
      color: 'border-amber-400/80 text-amber-400',
      pulse: 'animate-badge-pulse-amber',
    },
    alerts.fluxo && {
      key: 'fluxo',
      href: '/operations',
      label: 'FLUXO',
      Icon: Workflow,
      color: 'border-amber-400/80 text-amber-400',
      pulse: 'animate-badge-pulse-amber',
    },
  ].filter(Boolean) as {
    key: string;
    href: string;
    label: string;
    Icon: React.ElementType;
    color: string;
    pulse: string;
  }[];

  if (badges.length === 0) return null;

  return (
    <div className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-20">
      {badges.map((b) => (
        <Link key={b.key} href={b.href} aria-label={b.label}>
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border-2 text-[10px] font-bold tracking-widest uppercase ${b.color} ${b.pulse}`}
          >
            <b.Icon className="h-3 w-3 flex-shrink-0" />
            <span>{b.label}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
