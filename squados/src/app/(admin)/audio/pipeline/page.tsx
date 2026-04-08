import { requirePermission } from '@/shared/lib/rbac/guards';
import { FileAudio } from 'lucide-react';

export default async function PipelinePage() {
  await requirePermission('audio_monitoring', 'read');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileAudio className="w-6 h-6 text-primary" />
        Pipeline de Processamento
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Status de transcrição e classificação — em implementação (Fase 3)
      </p>
    </div>
  );
}
