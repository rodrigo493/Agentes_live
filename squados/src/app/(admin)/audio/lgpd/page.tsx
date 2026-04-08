import { requirePermission } from '@/shared/lib/rbac/guards';
import { Settings2 } from 'lucide-react';

export default async function LgpdPage() {
  await requirePermission('audio_monitoring', 'manage');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Settings2 className="w-6 h-6 text-primary" />
        LGPD — Privacidade e Retenção
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Configuração de retenção, anonimização e consentimento — em implementação (Fase 6)
      </p>
    </div>
  );
}
