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

      try {
        // Tenta Service Worker primeiro — mais confiável no Windows (aparece mesmo com aba minimizada)
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(title, {
            body: truncated,
            icon,
            badge: '/squados-icon.png',
            tag: `workspace-${Date.now()}`,
            data: { url },
          });
          return;
        }
      } catch {
        // Service Worker falhou — fallback para new Notification()
      }

      // Fallback: new Notification() direto
      try {
        const notification = new Notification(title, {
          body: truncated,
          icon,
          badge: '/squados-icon.png',
          tag: `workspace-${url}`,
        });

        notification.onclick = () => {
          window.focus();
          router.push(url);
          notification.close();
        };

        setTimeout(() => notification.close(), 5000);
      } catch (err) {
        console.error('[desktop-notifications] failed to create notification:', err);
      }
    },
    [isSupported, router]
  );

  return { notify, permissionState, requestPermission };
}
