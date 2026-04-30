'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkNotification } from '../hooks/use-work-notification';

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

  const handleVerAgora = useCallback(() => {
    router.push(`/operations/card/${notification.workflow_step_id}`);
    onDismiss();
  }, [router, notification.workflow_step_id, onDismiss]);

  return (
    <>
      <style>{`
        @keyframes nt-blink-orange {
          0% {
            border-top-color: #ff6b00;
            border-bottom-color: #ff6b00;
            box-shadow:
              0 0 14px 4px rgba(255,220,0,0.40),
              0 0 32px 10px rgba(255,200,0,0.18),
              0 -6px 20px rgba(255,107,0,0.60),
              0  6px 20px rgba(255,107,0,0.60);
          }
          100% {
            border-top-color: rgba(255,107,0,0.12);
            border-bottom-color: rgba(255,107,0,0.12);
            box-shadow:
              0 0 8px 2px rgba(255,220,0,0.12),
              0 0 16px 4px rgba(255,200,0,0.07),
              0 -2px 8px rgba(255,107,0,0.18),
              0  2px 8px rgba(255,107,0,0.18);
          }
        }
        @keyframes nt-flicker {
          0%, 89%, 100% { opacity: 1; }
          91%            { opacity: 0.82; }
          93%            { opacity: 1; }
          95%            { opacity: 0.88; }
        }
        @keyframes nt-pulse-dot {
          0%   { box-shadow: 0 0 4px 1px rgba(255,230,0,0.55); }
          100% { box-shadow: 0 0 12px 4px rgba(255,230,0,0.90); }
        }
        .nt-banner {
          position: fixed;
          top: 56px;
          left: 0;
          right: 0;
          height: 52px;
          background: #0a0a0a;
          border-top: 2px solid #ff6b00;
          border-bottom: 2px solid #ff6b00;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          z-index: 9999;
          animation: nt-blink-orange 0.7s ease-in-out infinite alternate;
        }
        .nt-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: #ffe600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          text-shadow:
            0 0 8px rgba(255,230,0,0.85),
            0 0 22px rgba(255,220,0,0.40);
          animation: nt-flicker 2.5s ease-in-out infinite;
        }
        .nt-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ffe600;
          flex-shrink: 0;
          animation: nt-pulse-dot 0.8s ease-in-out infinite alternate;
        }
        .nt-tag {
          font-size: 0.58rem;
          font-weight: 700;
          color: #ff8c00;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-shadow: 0 0 8px rgba(255,140,0,0.55);
        }
        .nt-ref {
          font-size: 0.68rem;
          color: #555;
          margin-left: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .nt-btn {
          background: transparent;
          border: 1px solid #333;
          color: #aaa;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 5px 14px;
          border-radius: 5px;
          cursor: pointer;
          letter-spacing: 0.04em;
          white-space: nowrap;
          transition: border-color 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .nt-btn:hover {
          border-color: #ff8c00;
          color: #ffb300;
        }
      `}</style>

      <div className="nt-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div className="nt-dot" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
            <span className="nt-tag">⚡ Operações</span>
            <span className="nt-title">Novo Trabalho</span>
          </div>
          <span className="nt-ref">
            {notification.title}
            {notification.reference ? ` · ${notification.reference}` : ''}
          </span>
        </div>

        <button className="nt-btn" onClick={handleVerAgora}>
          Ver agora →
        </button>
      </div>
    </>
  );
}
