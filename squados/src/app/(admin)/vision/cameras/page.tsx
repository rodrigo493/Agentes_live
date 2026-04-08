import { requirePermission } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { CameraManagement } from '@/features/vision/components/camera-management';
import { Camera } from 'lucide-react';

export default async function CamerasPage() {
  await requirePermission('vision_monitoring', 'write');
  const admin = createAdminClient();

  const { data: cameras } = await admin
    .from('camera_devices')
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
          <Camera className="w-6 h-6 text-primary" />
          Câmeras por Célula
        </h1>
        <p className="text-sm text-muted-foreground">
          Cadastro de dispositivos de captura visual por zona da fábrica
        </p>
      </div>
      <CameraManagement cameras={(cameras ?? []) as any} sectors={sectors ?? []} />
    </div>
  );
}
