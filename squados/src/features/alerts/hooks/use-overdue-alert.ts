'use client';

import { useEffect, useState } from 'react';
import { hasMyOverdueAction } from '../actions/overdue-alert-actions';

const POLL_INTERVAL_MS = 60_000;

function detectTestMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('alerts-test') === '1';
}

export function useOverdueAlert() {
  const [state, setState] = useState<{ hasOverdue: boolean; count: number }>({
    hasOverdue: false,
    count: 0,
  });
  const [isTestMode, setIsTestMode] = useState(false);

  useEffect(() => {
    setIsTestMode(detectTestMode());
    const onUrlChange = () => setIsTestMode(detectTestMode());
    window.addEventListener('popstate', onUrlChange);
    return () => window.removeEventListener('popstate', onUrlChange);
  }, []);

  useEffect(() => {
    let alive = true;

    async function check() {
      const r = await hasMyOverdueAction();
      if (!alive) return;
      if (r.error) return;
      setState({ hasOverdue: r.hasOverdue, count: r.count });
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

  if (isTestMode) {
    return { hasOverdue: true, count: 2 };
  }

  return state;
}
