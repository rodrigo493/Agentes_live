'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useOverdueAlert } from '../hooks/use-overdue-alert';

export function OverdueBeacons() {
  const { hasOverdue, count } = useOverdueAlert();
  if (!hasOverdue) return null;

  return (
    <>
      <OverdueBeacon side="left" count={count} />
      <OverdueBeacon side="right" count={count} />
      <OverdueGlow side="left" />
      <OverdueGlow side="right" />
    </>
  );
}

function OverdueBeacon({ side, count }: { side: 'left' | 'right'; count: number }) {
  const isLeft = side === 'left';
  const src = isLeft ? '/atraso-left.png' : '/atraso-right.png';
  return (
    <Link
      href="/producao"
      aria-label={`${count} item(ns) em atraso — clique para ver`}
      title={`${count} em atraso`}
      className={`absolute top-1/2 -translate-y-1/2 z-20 pointer-events-auto animate-alert-logo-pulse ${
        isLeft ? 'left-1 sm:left-3' : 'right-1 sm:right-3'
      }`}
    >
      <Image
        src={src}
        alt="ATRASO"
        width={52}
        height={26}
        className="h-8 sm:h-9 w-auto object-contain"
        priority
      />
    </Link>
  );
}

function OverdueGlow({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left';
  return (
    <div
      className={`pointer-events-none absolute top-full h-24 w-28 sm:h-32 sm:w-36 z-10 animate-beacon-glow ${
        isLeft ? 'left-2 sm:left-6' : 'right-2 sm:right-6'
      }`}
      style={{
        background:
          'radial-gradient(ellipse at center top, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0.55) 25%, rgba(239,68,68,0.15) 55%, rgba(239,68,68,0) 80%)',
        filter: 'blur(3px)',
        transformOrigin: 'top center',
      }}
      aria-hidden
    />
  );
}
