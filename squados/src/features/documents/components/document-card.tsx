'use client';

import { useState, useTransition } from 'react';
import { FileText, Download, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getSignedDownloadUrlAction } from '../actions/document-actions';
import type { DocumentFile } from '../actions/document-actions';
import { toast } from 'sonner';

interface Props {
  title: string;
  icon: React.ReactNode;
  files: DocumentFile[];
}

export function DocumentCard({ title, icon, files }: Props) {
  const [query, setQuery] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = files.filter((f) =>
    f.file_name.toLowerCase().includes(query.toLowerCase())
  );

  function handleDownload(file: DocumentFile) {
    setDownloading(file.id);
    startTransition(async () => {
      try {
        const url = await getSignedDownloadUrlAction(file.storage_path);
        if (!url) { toast.error('Erro ao gerar link'); return; }
        const a = document.createElement('a');
        a.href = url;
        a.download = file.file_name;
        a.click();
      } finally {
        setDownloading(null);
      }
    });
  }

  function formatSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="rounded-lg border bg-card flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <span className="text-xs text-muted-foreground">{files.length}</span>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nesta pasta…"
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-64 px-3 py-2 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {query ? 'Nenhum arquivo encontrado.' : 'Nenhum documento ainda.'}
          </p>
        ) : (
          filtered.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{f.file_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {f.sender_name} · {new Date(f.created_at).toLocaleDateString('pt-BR')} · {formatSize(f.file_size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => handleDownload(f)}
                disabled={downloading === f.id || isPending}
                title="Baixar"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
