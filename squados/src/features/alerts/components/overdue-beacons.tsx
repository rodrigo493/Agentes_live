'use client';

import Link from 'next/link';
import { useOverdueAlert } from '../hooks/use-overdue-alert';

export function OverdueBeacons() {
  const { hasOverdue, count } = useOverdueAlert();
  if (!hasOverdue) return null;

  return (
    <>
      <OverdueBeacon side="left" count={count} />
      <OverdueBeacon side="right" count={count} />
    </>
  );
}

function OverdueBeacon({ side, count }: { side: 'left' | 'right'; count: number }) {
  const isLeft = side === 'left';
  return (
    <Link
      href="/producao"
      aria-label={`${count} item(ns) em atraso — clique para ver`}
      title={`${count} em atraso`}
      className={`group absolute top-0 h-full flex items-center z-10 ${
        isLeft ? 'left-0 pl-2 sm:pl-4' : 'right-0 pr-2 sm:pr-4'
      }`}
    >
      <div className="relative">
        <div
          className="h-9 w-10 sm:h-10 sm:w-12 bg-no-repeat animate-beacon-pulse"
          style={{
            backgroundImage: "url('/atraso.png')",
            backgroundPosition: isLeft ? 'left center' : 'right center',
            backgroundSize: 'auto 100%',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 h-24 w-24 sm:h-32 sm:w-32 rounded-full animate-beacon-glow"
          style={{
            background:
              'radial-gradient(circle at center top, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0.55) 25%, rgba(239,68,68,0.15) 55%, rgba(239,68,68,0) 80%)',
            filter: 'blur(2px)',
          }}
          aria-hidden
        />
      </div>
    </Link>
  );
}
