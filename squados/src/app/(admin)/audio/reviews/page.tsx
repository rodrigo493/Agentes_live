import { requirePermission } from '@/shared/lib/rbac/guards';
import { Shield } from 'lucide-react';

export default async function ReviewsPage() {
  await requirePermission('audio_monitoring', 'read');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Shield className="w-6 h-6 text-primary" />
        Revisão de Eventos
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Fila de revisão humana obrigatória — em implementação (Fase 5)
      </p>
    </div>
  );
}
