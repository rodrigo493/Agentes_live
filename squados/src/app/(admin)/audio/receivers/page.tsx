import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { ReceiverManagement } from '@/features/audio/components/receiver-management';
import { Mic } from 'lucide-react';

export default async function ReceiversPage() {
  await requirePermission('audio_monitoring', 'write');
  const admin = createAdminClient();

  const { data: receivers } = await admin
    .from('audio_receivers')
    .select('*, sectors(name, slug)')
    .eq('is_active', true)
    .order('name');

  const { data: sectors } = await admin
    .from('sectors')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mic className="w-6 h-6 text-primary" />
          Receptores de Áudio
        </h1>
        <p className="text-sm text-muted-foreground">
          Dispositivos de captura mapeados por zona da fábrica
        </p>
      </div>

      <ReceiverManagement
        receivers={(receivers ?? []) as any}
        sectors={sectors ?? []}
      />
    </div>
  );
}
