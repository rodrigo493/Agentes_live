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
    (title: string, body: string, url: string) => {
      if (!isSupported || Notification.permission !== 'granted') return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

      const truncated = body.length > 60 ? body.slice(0, 60) + '…' : body;

      const notification = new Notification(title, {
        body: truncated,
        icon: '/globe.svg',
      });

      notification.onclick = () => {
        window.focus();
        router.push(url);
        notification.close();
      };

      setTimeout(() => notification.close(), 5000);
    },
    [isSupported, router]
  );

  return { notify, permissionState, requestPermission };
}
