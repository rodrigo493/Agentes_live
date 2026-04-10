'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

type PermissionState = NotificationPermission | 'unsupported';

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
    (title: string, body: string, url: string, iconUrl?: string | null) => {
      if (!isSupported || Notification.permission !== 'granted') return;

      // Nota: NAO filtramos por document.visibilityState aqui porque o
      // chamador (workspace-shell) ja decide se deve notificar baseado
      // em activeChatRef (so notifica se a mensagem for de outra conversa).
      // Comportamento tipo WhatsApp Web: sempre popup, exceto na conversa ativa.

      const truncated = body.length > 60 ? body.slice(0, 60) + '…' : body;

      try {
        const notification = new Notification(title, {
          body: truncated,
          // Avatar do remetente (ou fallback para logo do SquadOS)
          icon: iconUrl || '/globe.svg',
          // badge = icone pequeno no canto (mobile/PWA); no desktop e ignorado
          badge: '/globe.svg',
          tag: url, // coalesce multiple notifications for same url
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
