'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Paperclip, FileText, Download, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/shared/lib/supabase/client';
import { toast } from 'sonner';
import {
  uploadWorkflowAttachmentAction,
  getWorkflowAttachmentsAction,
  decideWorkflowAttachmentAction,
  getSignedAttachmentUrlAction,
  type WorkflowAttachment,
} from '../actions/workflow-attachment-actions';

interface Props {
  instanceId: string;
  stepId: string;
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function WorkflowAttachmentsSection({ instanceId, stepId }: Props) {
  const [attachments, setAttachments] = useState<WorkflowAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);

  async function loadAttachments() {
    const data = await getWorkflowAttachmentsAction(instanceId);
    setAttachments(data);
  }

  useEffect(() => {
    loadAttachments();
  }, [instanceId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Arquivo deve ter no máximo 20 MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? '';
      const uniqueName = `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
      const storagePath = `${instanceId}/${stepId}/${uniqueName}`;

      const { error: storageError } = await supabase.storage
        .from('workflow-attachments')
        .upload(storagePath, file, { contentType: file.type });

      if (storageError) { toast.error('Erro no upload: ' + storageError.message); return; }

      const result = await uploadWorkflowAttachmentAction({
        instanceId,
        stepId,
        storagePath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      if (result.error) { toast.error(result.error); return; }

      toast.success('Arquivo anexado');
      await loadAttachments();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDecide(id: string, decision: 'seguir' | 'nao_seguir') {
    setDeciding(id);
    // Optimistic update
    setAttachments((prev) =>
      prev.map((a) => a.id === id ? { ...a, decision } : a)
    );
    try {
      const result = await decideWorkflowAttachmentAction(id, decision);
      if (result.error) {
        toast.error(result.error);
        // Revert
        setAttachments((prev) =>
          prev.map((a) => a.id === id ? { ...a, decision: null } : a)
        );
      } else {
        await loadAttachments();
      }
    } finally {
      setDeciding(null);
    }
  }

  async function handleDownload(attachment: WorkflowAttachment) {
    setDownloading(attachment.id);
    try {
      const url = await getSignedAttachmentUrlAction(attachment.storage_path);
      if (!url) { toast.error('Erro ao gerar link'); return; }
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      a.click();
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Anexos</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Paperclip className="h-3.5 w-3.5" />
          }
          {uploading ? 'Enviando…' : 'Anexar'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo ainda.</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((a) => (
            <div key={a.id} className="rounded border bg-muted/30 p-2 space-y-1.5">
              {/* Cabeçalho do arquivo */}
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{a.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {a.step_title} · {a.uploader_name} · {fmtDate(a.uploaded_at)} · {formatSize(a.file_size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => handleDownload(a)}
                  disabled={downloading === a.id}
                  title="Baixar"
                >
                  {downloading === a.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Download className="h-3 w-3" />
                  }
                </Button>
              </div>

              {/* Decisão */}
              {a.decision === null ? (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] border-green-500/60 text-green-500 hover:bg-green-500/10"
                    onClick={() => handleDecide(a.id, 'seguir')}
                    disabled={deciding === a.id}
                  >
                    {deciding === a.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <><Check className="h-3 w-3 mr-1" />Seguir</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] border-red-500/60 text-red-500 hover:bg-red-500/10"
                    onClick={() => handleDecide(a.id, 'nao_seguir')}
                    disabled={deciding === a.id}
                  >
                    <><X className="h-3 w-3 mr-1" />Não Seguir</>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  {a.decision === 'seguir' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-500">
                      <Check className="h-3 w-3" /> Seguiu
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500">
                      <X className="h-3 w-3" /> Não Seguiu
                    </span>
                  )}
                  {a.decider_name && (
                    <span className="text-[10px] text-muted-foreground">· {a.decider_name}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
