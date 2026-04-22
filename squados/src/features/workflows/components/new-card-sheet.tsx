'use client';

import { useState, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Paperclip, X, FileText, Image, FileSpreadsheet, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/shared/lib/supabase/client';
import { createWorkItemAction, advanceWithNoteAction } from '../actions/pasta-actions';
import { uploadWorkflowAttachmentAction } from '../actions/workflow-attachment-actions';

interface UserOption {
  id: string;
  full_name: string | null;
}

interface Props {
  open: boolean;
  templateId: string;
  templateName: string;
  users?: UserOption[];
  onClose: () => void;
  onCreated: () => void;
}

type FileItem = { file: File; id: string };

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <Image className="w-3.5 h-3.5 text-blue-400" />;
  if (mime.includes('spreadsheet') || mime.includes('excel'))
    return <FileSpreadsheet className="w-3.5 h-3.5 text-green-400" />;
  return <FileText className="w-3.5 h-3.5 text-zinc-400" />;
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

export function NewCardSheet({ open, templateId, templateName, users = [], onClose, onCreated }: Props) {
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [
      ...prev,
      ...Array.from(list).map((f) => ({ file: f, id: `${Date.now()}-${Math.random()}` })),
    ]);
  }

  async function save(andAdvance = false) {
    if (!reference.trim()) { setErr('Referência obrigatória'); return; }
    if (!title.trim()) { setErr('Título obrigatório'); return; }
    setErr('');
    setSaving(true);
    try {
      const result = await createWorkItemAction({
        reference: reference.trim(),
        title: title.trim(),
        template_id: templateId,
        initial_note: note.trim() || undefined,
        assignee_id: assigneeId || null,
      });
      if (result.error) { setErr(result.error); return; }

      const instanceId = result.instance_id!;
      const firstStepId = result.first_step_id;

      if (files.length > 0 && firstStepId) {
        const supabase = createClient();
        for (const item of files) {
          const ext = item.file.name.split('.').pop() ?? 'bin';
          const path = `workflow/${instanceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('workflow-attachments')
            .upload(path, item.file, { contentType: item.file.type, upsert: false });
          if (upErr) { toast.error(`Erro ao enviar ${item.file.name}`); continue; }
          await uploadWorkflowAttachmentAction({
            instanceId,
            stepId: firstStepId,
            storagePath: path,
            fileName: item.file.name,
            fileSize: item.file.size,
            mimeType: item.file.type || 'application/octet-stream',
          });
        }
      }

      if (andAdvance && firstStepId) {
        const { error: advErr } = await advanceWithNoteAction(firstStepId);
        if (advErr) toast.error(`Avançar: ${advErr}`);
      }

      toast.success('Card criado!');
      setReference(''); setTitle(''); setNote(''); setAssigneeId(''); setFiles([]);
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md bg-zinc-900 border-zinc-700 text-white flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-zinc-800">
          <SheetTitle className="text-white text-sm font-semibold">
            Novo card —{' '}
            <span className="text-violet-400">{templateName}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1">
            <div className="text-[11px] text-zinc-400 font-medium">Referência *</div>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 placeholder:text-zinc-600"
              placeholder="PA.0234"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <div className="text-[11px] text-zinc-400 font-medium">Título / Descrição *</div>
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 placeholder:text-zinc-600 resize-none"
              placeholder="Descreva o item de trabalho…"
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {users.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-400 font-medium">Atribuir a</div>
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">Automático (responsável da etapa)</option>
                {users
                  .slice()
                  .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name ?? '—'}</option>
                  ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-[11px] text-zinc-400 font-medium">Observações</div>
            <textarea
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 placeholder:text-zinc-600 resize-none"
              placeholder="Contexto ou instruções para o responsável…"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <div className="text-[11px] text-zinc-400 font-medium">Arquivos</div>
            <div
              className="border-2 border-dashed border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-zinc-500 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              onDragOver={(e) => e.preventDefault()}
            >
              <Paperclip className="w-5 h-5 text-zinc-600 mx-auto mb-1.5" />
              <p className="text-xs text-zinc-500">Arraste ou clique para adicionar</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">JPG, PNG, PDF, Word, Excel</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                    {fileIcon(item.file.type)}
                    <span className="flex-1 text-xs text-zinc-300 truncate">{item.file.name}</span>
                    <span className="text-[10px] text-zinc-500 shrink-0">{fmt(item.file.size)}</span>
                    <button onClick={() => setFiles((p) => p.filter((f) => f.id !== item.id))} className="text-zinc-600 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Salvar
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Salvar e avançar
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
