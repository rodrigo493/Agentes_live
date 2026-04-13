'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Trash2, FileText, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  createProcedureAction,
  updateProcedureAction,
  uploadProcedureMediaAction,
  deleteProcedureMediaAction,
} from '../actions/assembly-actions';
import type { AssemblyProcedureFull, AssemblyProcedureMedia } from '@/shared/types/database';

interface Props {
  sectorId: string;
  procedure: AssemblyProcedureFull | null;
  open: boolean;
  onClose: () => void;
  onSaved: (p: AssemblyProcedureFull) => void;
}

export function ProcedureEditorModal({ sectorId, procedure, open, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(procedure?.title ?? '');
  const [description, setDescription] = useState(procedure?.description ?? '');
  const [procedureText, setProcedureText] = useState(procedure?.procedure_text ?? '');
  const [media, setMedia] = useState<AssemblyProcedureMedia[]>(procedure?.media ?? []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleSave() {
    if (!title.trim() || !procedureText.trim()) {
      return toast.error('Título e procedimento são obrigatórios');
    }
    setSaving(true);
    try {
      let id = procedure?.id;
      if (id) {
        const r = await updateProcedureAction(id, {
          title, description: description || null, procedure_text: procedureText,
        });
        if (r.error) throw new Error(r.error);
      } else {
        const r = await createProcedureAction({
          sector_id: sectorId,
          title, description, procedure_text: procedureText,
        });
        if (r.error || !r.procedure) throw new Error(r.error);
        id = r.procedure.id;
      }
      onSaved({
        id: id!,
        sector_id: sectorId,
        title, description: description || null, procedure_text: procedureText,
        knowledge_doc_id: procedure?.knowledge_doc_id ?? null,
        tags: procedure?.tags ?? [],
        is_active: true,
        created_by: procedure?.created_by ?? null,
        created_at: procedure?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        media,
        sector_name: procedure?.sector_name ?? null,
        sector_icon: procedure?.sector_icon ?? null,
      });
      toast.success('Roteiro salvo e enviado para base de conhecimento do setor');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    if (!procedure?.id) {
      return toast.error('Salve o roteiro primeiro para adicionar mídias.');
    }
    const isPdf   = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) return toast.error('Formato não suportado (use JPG, PNG ou PDF)');
    if (file.size > 20 * 1024 * 1024) return toast.error('Arquivo maior que 20MB');

    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('procedure_id', procedure.id);
    fd.append('type', isPdf ? 'pdf' : 'image');
    const r = await uploadProcedureMediaAction(fd);
    setUploading(false);
    if (r.error) return toast.error(r.error);
    if (r.media) setMedia((p) => [...p, r.media!]);
    toast.success('Arquivo enviado');
  }

  async function handleDeleteMedia(id: string) {
    if (!confirm('Remover este arquivo?')) return;
    const r = await deleteProcedureMediaAction(id);
    if (r.error) return toast.error(r.error);
    setMedia((p) => p.filter((m) => m.id !== id));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{procedure ? 'Editar Roteiro' : 'Novo Roteiro'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
                   placeholder="Ex: Montagem do chassi do modelo X" />
          </div>
          <div>
            <Label>Descrição curta</Label>
            <Input value={description ?? ''} onChange={(e) => setDescription(e.target.value)}
                   placeholder="Resumo de 1 linha (opcional)" />
          </div>
          <div>
            <Label>Procedimento completo *</Label>
            <Textarea
              rows={10}
              value={procedureText}
              onChange={(e) => setProcedureText(e.target.value)}
              placeholder={`Passo a passo detalhado. Exemplo:\n\n1. Verificar parafusos M8\n2. Posicionar peça A…\n3. Soldar pontos 1-4…`}
            />
          </div>

          {procedure?.id && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Imagens e PDFs</Label>
                <label className="inline-flex items-center gap-1 text-xs cursor-pointer bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90">
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Enviando…' : 'Anexar arquivo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              {media.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Nenhum arquivo ainda. Aceita JPG, PNG, WEBP, GIF e PDF (até 20MB).
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {media.map((m) => (
                    <div key={m.id} className="relative border rounded-lg overflow-hidden group">
                      {m.type === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt={m.caption ?? ''} className="aspect-video object-cover w-full" />
                      ) : (
                        <a href={m.url} target="_blank" rel="noopener noreferrer"
                           className="aspect-video flex items-center justify-center bg-muted hover:bg-muted/70">
                          <div className="text-center">
                            <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
                            <span className="text-[10px]">PDF</span>
                          </div>
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteMedia(m.id)}
                        className="absolute top-1 right-1 p-1 rounded bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!procedure?.id && (
            <p className="text-[11px] text-muted-foreground italic">
              💡 Salve primeiro para anexar imagens e PDFs.
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Placeholder() { return <ImageIcon className="w-4 h-4" />; }
