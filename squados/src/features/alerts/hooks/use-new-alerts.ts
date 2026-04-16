'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/shared/lib/supabase/client';
import {
  hasFluxoAlertAction,
  hasEmailAlertAction,
} from '../actions/new-alerts-actions';

const POLL_INTERVAL_MS = 60_000;

export interface NewAlertsState {
  fluxo: boolean;
  message: boolean;
  email: boolean;
  fluxoCount: number;
  messageCount: number;
  emailCount: number;
}

const EMPTY: NewAlertsState = {
  fluxo: false,
  message: false,
  email: false,
  fluxoCount: 0,
  messageCount: 0,
  emailCount: 0,
};

export function useNewAlerts(): NewAlertsState {
  const [state, setState] = useState<NewAlertsState>(EMPTY);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTestMode = searchParams.get('alerts-test') === '1';

  // Polling: fluxo + email (ambos consultam DB)
  useEffect(() => {
    let alive = true;

    async function check() {
      const [fluxo, email] = await Promise.all([
        hasFluxoAlertAction(),
        hasEmailAlertAction(),
      ]);
      if (!alive) return;
      setState((s) => ({
        ...s,
        fluxo: fluxo.hasAlert,
        email: email.hasAlert,
        fluxoCount: fluxo.count,
        emailCount: email.count,
      }));
    }

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Realtime global: mensagens novas — acende badge em qualquer rota e dispara toast
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function setup() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      const myId = session.user.id;

      const channel = supabase
        .channel('app-shell-msg-alert')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const msg = payload.new as {
              id: string;
              sender_id: string | null;
              content: string;
              conversation_id: string;
            };

            // Ignora minhas próprias mensagens
            if (msg.sender_id === myId) return;

            setState((s) => ({
              ...s,
              message: true,
              messageCount: s.messageCount + 1,
            }));

            // Toast global: só dispara se NÃO estivermos dentro de /workspace
            // (o workspace-shell já dispara seu próprio toast quando montado)
            if (!window.location.pathname.startsWith('/workspace')) {
              const preview =
                msg.content.length > 60
                  ? msg.content.slice(0, 60) + '…'
                  : msg.content;
              toast('Nova mensagem', { description: preview, duration: 5000 });
            }
          }
        )
        .subscribe();

      cleanup = () => {
        supabase.removeChannel(channel);
      };
    }

    setup();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Ao navegar pra /workspace, zera badge de mensagem
  useEffect(() => {
    if (pathname.startsWith('/workspace')) {
      setState((s) => ({ ...s, message: false, messageCount: 0 }));
    }
  }, [pathname]);

  // Modo teste: força todos os alertas a aparecer (pra validação visual)
  if (isTestMode) {
    return {
      fluxo: true,
      message: true,
      email: true,
      fluxoCount: 3,
      messageCount: 5,
      emailCount: 2,
    };
  }

  return state;
}
