'use client';

import { useState } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, Link2, Image as ImageIcon, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createCatalogProcessAction,
  updateCatalogProcessAction,
  addCatalogMediaAction,
  deleteCatalogMediaAction,
} from '../actions/catalog-actions';
import type { ProcessCatalogFull, ProcessCatalogMedia, Sector } from '@/shared/types/database';

const COLOR_OPTIONS = [
  { value: 'violet', label: 'Violeta' }, { value: 'blue', label: 'Azul' },
  { value: 'emerald', label: 'Verde' }, { value: 'amber', label: 'Âmbar' },
  { value: 'rose', label: 'Rosa' }, { value: 'slate', label: 'Cinza' },
];

interface ProcessFormModalProps {
  open: boolean;
  process: ProcessCatalogFull | null; // null = criar
  sectors: Sector[];
  onClose: () => void;
  onSaved: (process: ProcessCatalogFull) => void;
}

export function ProcessFormModal({ open, process, sectors, onClose, onSaved }: ProcessFormModalProps) {
  const supabase = createClient();
  const [title, setTitle] = useState(process?.title ?? '');
  const [description, setDescription] = useState(process?.description ?? '');
  const [sectorId, setSectorId] = useState<string>(process?.sector_id ?? '');
  const [color, setColor] = useState(process?.color ?? 'violet');
  const [media, setMedia] = useState<ProcessCatalogMedia[]>(process?.media ?? []);
  const [saving, setSaving] = useState(false);

  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        sector_id: sectorId || null,
        title,
        description: description || undefined,
        color,
      };

      if (process) {
        const res = await updateCatalogProcessAction(process.id, payload);
        if (res.error) { toast.error(res.error); return; }
        onSaved({ ...process, ...res.process!, sector_name: process.sector_name, sector_icon: process.sector_icon, media });
      } else {
        const res = await createCatalogProcessAction(payload);
        if (res.error) { toast.error(res.error); return; }
        const sector = sectors.find(s => s.id === sectorId);
        onSaved({
          ...res.process!,
          sector_name: sector?.name ?? null,
          sector_icon: sector?.icon ?? null,
          media: [],
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMedia() {
    if (!process) return;
    setUploadingMedia(true);
    try {
      let finalUrl = mediaUrl;
      if (mediaType === 'image' && mediaFile) {
        const ext = mediaFile.name.split('.').pop() ?? 'jpg';
        const path = `${process.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('production-media')
          .upload(path, mediaFile, { upsert: true });
        if (upErr) { toast.error('Falha no upload: ' + upErr.message); return; }
        const { data: urlData } = supabase.storage.from('production-media').getPublicUrl(path);
        finalUrl = urlData.publicUrl;
      }
      if (!finalUrl.trim()) { toast.error('Informe a URL ou selecione um arquivo'); return; }
      const res = await addCatalogMediaAction({
        catalog_process_id: process.id,
        type: mediaType,
        url: finalUrl,
        caption: mediaCaption,
      });
      if (res.error) { toast.error(res.error); return; }
      setMedia(prev => [...prev, res.media!]);
      setMediaUrl('');
      setMediaCaption('');
      setMediaFile(null);
      toast.success('Mídia adicionada');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleDeleteMedia(id: string) {
    const res = await deleteCatalogMediaAction(id);
    if (res.error) { toast.error(res.error); return; }
    setMedia(prev => prev.filter(m => m.id !== id));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{process ? 'Editar Processo' : 'Novo Processo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Setor</Label>
            <select
              value={sectorId}
              onChange={e => setSectorId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-muted px-3 text-sm"
            >
              <option value="">Sem setor</option>
              {sectors.map(s => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome do processo" />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Instruções..." rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`px-3 py-1 rounded-md text-xs border-2 transition-all ${
                    color === c.value ? 'border-primary font-bold' : 'border-border'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mídias — só disponível ao editar */}
          {process && (
            <div className="space-y-2 border-t border-border pt-4">
              <Label>Mídias ({media.length})</Label>
              {media.length > 0 && (
                <ScrollArea className="h-32">
                  {media.map(m => (
                    <div key={m.id} className="flex items-center gap-2 py-1 text-sm">
                      {m.type === 'image' ? <ImageIcon className="w-4 h-4 flex-shrink-0" /> : <Video className="w-4 h-4 flex-shrink-0" />}
                      <span className="flex-1 truncate text-xs">{m.caption || m.url}</span>
                      <button onClick={() => handleDeleteMedia(m.id)} className="p-0.5 hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </ScrollArea>
              )}

              <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
                <div className="flex gap-2">
                  {(['image', 'video'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setMediaType(t)}
                      className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                        mediaType === t ? 'bg-primary text-primary-foreground border-transparent' : 'border-input'
                      }`}
                    >
                      {t === 'image' ? 'Imagem' : 'Vídeo'}
                    </button>
                  ))}
                </div>

                {mediaType === 'image' ? (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-primary">
                      <Upload className="w-3.5 h-3.5" />
                      {mediaFile ? mediaFile.name : 'Selecionar arquivo'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => setMediaFile(e.target.files?.[0] ?? null)} />
                    </label>
                    <p className="text-[10px] text-muted-foreground">ou URL:</p>
                    <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                    <Input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="YouTube / Vimeo URL" className="h-8 text-xs" />
                  </div>
                )}
                <Input value={mediaCaption} onChange={e => setMediaCaption(e.target.value)} placeholder="Legenda (opcional)" className="h-8 text-xs" />
                <Button size="sm" variant="outline" onClick={handleAddMedia} disabled={uploadingMedia} className="w-full h-8 text-xs">
                  {uploadingMedia ? 'Enviando...' : '+ Adicionar mídia'}
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()} className="flex-1">
              {saving ? 'Salvando...' : process ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
