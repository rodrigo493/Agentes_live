'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import type { WorkflowInboxItem } from '@/shared/types/database';

export interface WorkNotification {
  id: string;
  workflow_step_id: string;
  instance_id: string;
  title: string;
  reference: string | null;
}

export function useWorkNotification(userId: string) {
  const [queue, setQueue] = useState<WorkNotification[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    if (!userId || channelRef.current) return;

    const supabase = createClient();

    channelRef.current = supabase
      .channel('work-notification-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workflow_inbox_items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const item = payload.new as WorkflowInboxItem;
          setQueue((prev) => [
            ...prev,
            {
              id: item.id,
              workflow_step_id: item.workflow_step_id,
              instance_id: item.instance_id,
              title: item.title,
              reference: item.reference,
            },
          ]);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);

  const notification: WorkNotification | null = queue.length > 0 ? queue[0] : null;

  function dismiss() {
    setQueue((prev) => prev.slice(1));
  }

  return { notification, dismiss };
}
