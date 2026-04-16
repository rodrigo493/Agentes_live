'use client';

import { useEffect, useState } from 'react';
import {
  hasFluxoAlertAction,
  hasMessageAlertAction,
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

  useEffect(() => {
    let alive = true;

    async function check() {
      const [fluxo, message, email] = await Promise.all([
        hasFluxoAlertAction(),
        hasMessageAlertAction(),
        hasEmailAlertAction(),
      ]);
      if (!alive) return;
      setState({
        fluxo: fluxo.hasAlert,
        message: message.hasAlert,
        email: email.hasAlert,
        fluxoCount: fluxo.count,
        messageCount: message.count,
        emailCount: email.count,
      });
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

  return state;
}
