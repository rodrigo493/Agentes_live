'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkNotification } from '../hooks/use-work-notification';
import styles from './work-notification-banner.module.css';

function playNewWorkSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const sequence = [880, 1046, 880];
    sequence.forEach((freq, i) => {
      const start = i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start + 0.13);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + 0.15);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.15);
    });
    // Close AudioContext after all notes finish (~0.59s + 100ms margin)
    setTimeout(() => { ctx.close(); }, 700);
  } catch {
    // silencioso se AudioContext indisponível
  }
}

interface WorkNotificationBannerProps {
  notification: WorkNotification;
  onDismiss: () => void;
}

export function WorkNotificationBanner({ notification, onDismiss }: WorkNotificationBannerProps) {
  const router = useRouter();

  useEffect(() => {
    playNewWorkSound();
  }, [notification.id]);

  function handleVerAgora() {
    router.push(`/operations/card/${notification.workflow_step_id}`);
    onDismiss();
  }

  return (
    <div className={styles.banner} role="alert" aria-live="assertive">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div className={styles.dot} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
          <span className={styles.tag}>⚡ Operações</span>
          <span className={styles.title}>Novo Trabalho</span>
        </div>
        <span className={styles.ref}>
          {notification.title}
          {notification.reference ? ` · ${notification.reference}` : ''}
        </span>
      </div>

      <button className={styles.btn} onClick={handleVerAgora}>
        Ver agora →
      </button>
    </div>
  );
}
