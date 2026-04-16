'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useNewAlerts } from '../hooks/use-new-alerts';

const CHANNELS = [
  { key: 'email', href: '/email', src: '/email-logo.png', alt: 'E-MAIL', width: 72 },
  { key: 'message', href: '/workspace', src: '/mensagem-logo.png', alt: 'MENSAGEM', width: 104 },
  { key: 'fluxo', href: '/operations', src: '/fluxo-logo.png', alt: 'FLUXO', width: 66 },
] as const;

export function NewAlertBadges() {
  const state = useNewAlerts();

  const active = CHANNELS.filter((c) => state[c.key as 'email' | 'message' | 'fluxo']);
  if (active.length === 0) return null;

  return (
    <div className="absolute left-1/2 top-full -translate-x-1/2 flex items-start gap-3 sm:gap-5 z-20 pointer-events-none">
      {active.map((ch) => {
        const count =
          ch.key === 'email'
            ? state.emailCount
            : ch.key === 'message'
              ? state.messageCount
              : state.fluxoCount;
        return <AlertBadge key={ch.key} channel={ch} count={count} />;
      })}
    </div>
  );
}

function AlertBadge({
  channel,
  count,
}: {
  channel: (typeof CHANNELS)[number];
  count: number;
}) {
  return (
    <Link
      href={channel.href}
      aria-label={`${channel.alt}: ${count} novo(s) — clique para abrir`}
      title={`${channel.alt} (${count})`}
      className="relative pointer-events-auto group"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 w-32 h-16 sm:w-40 sm:h-20 rounded-full animate-alert-glow-yellow"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(250,204,21,0.95) 0%, rgba(250,204,21,0.55) 30%, rgba(250,204,21,0.15) 60%, rgba(250,204,21,0) 85%)',
        }}
        aria-hidden
      />
      <div className="relative h-6 sm:h-7 flex items-center justify-center px-1 animate-alert-logo-pulse">
        <Image
          src={channel.src}
          alt={channel.alt}
          width={channel.width}
          height={24}
          className="h-6 sm:h-7 w-auto object-contain drop-shadow-lg"
          priority
        />
      </div>
    </Link>
  );
}
