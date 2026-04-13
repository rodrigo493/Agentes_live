'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

type PermissionState = NotificationPermission | 'unsupported';

// Registra o Service Worker uma vez quando o módulo é carregado
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // falha silenciosa — notificação via new Notification() como fallback
  });
}

// ── Som de alarme via Web Audio API ────────────────────────
export function playAlarmSound(volume = 0.5) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Bip de 10 segundos: padrão beep-pause repetido (~20 beeps)
    const BEEP_DUR   = 0.3;  // duração do beep
    const PAUSE_DUR  = 0.2;  // pausa entre beeps
    const CYCLE      = BEEP_DUR + PAUSE_DUR; // 0.5s por ciclo
    const TOTAL      = 10;   // segundos totais
    const COUNT      = Math.floor(TOTAL / CYCLE); // ~20 beeps

    for (let i = 0; i < COUNT; i++) {
      const start = i * CYCLE;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = i % 2 === 0 ? 880 : 1046; // alterna Lá/Dó
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.02);
      gain.gain.setValueAtTime(volume, ctx.currentTime + start + BEEP_DUR - 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + BEEP_DUR);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + BEEP_DUR);
    }
  } catch {
    // silencioso se AudioContext não disponível
  }
}

// ── Hook principal ──────────────────────────────────────────

export function useDesktopNotifications() {
  const router = useRouter();

  const isSupported =
    typeof window !== 'undefined' && 'Notification' in window;

  const permissionState: PermissionState = isSupported
    ? Notification.permission
    : 'unsupported';

  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (!isSupported) return 'unsupported';
    const result = await Notification.requestPermission();
    return result;
  }, [isSupported]);

  const notify = useCallback(
    async (title: string, body: string, url: string, iconUrl?: string | null) => {
      if (!isSupported || Notification.permission !== 'granted') return;

      const truncated = body.length > 60 ? body.slice(0, 60) + '…' : body;
      const icon = iconUrl || '/squados-icon.png';
      const tag  = `squad-reminder-${Date.now()}`;

      // Tenta Service Worker primeiro (aparece mesmo com aba minimizada no Windows)
      if ('serviceWorker' in navigator) {
        try {
          const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 3000)),
          ]);
          await (registration as ServiceWorkerRegistration).showNotification(title, {
            body: truncated,
            icon,
            badge: '/squados-icon.png',
            tag,
            requireInteraction: true, // mantém visível até o usuário clicar
            data: { url },
          });
          return;
        } catch {
          // fallback abaixo
        }
      }

      // Fallback: Notification() direto
      try {
        const n = new Notification(title, {
          body: truncated,
          icon,
          badge: '/squados-icon.png',
          tag,
          requireInteraction: true,
        });
        n.onclick = () => { window.focus(); router.push(url); n.close(); };
        setTimeout(() => n.close(), 15_000);
      } catch (err) {
        console.error('[desktop-notifications] failed:', err);
      }
    },
    [isSupported, router]
  );

  return { notify, permissionState, requestPermission };
}
