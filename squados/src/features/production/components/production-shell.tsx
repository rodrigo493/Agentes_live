'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { createClient } from '@/shared/lib/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  ArrowRight,
  ArrowDown,
  Pencil,
  Trash2,
  Image as ImageIcon,
  Video,
  X,
  ChevronLeft,
  ChevronRight,
  Workflow,
  Upload,
  Link2,
  Users,
  ExternalLink,
} from 'lucide-react';
import { TaskFlowSection } from './task-flow-section';
import { CalendarSection } from '@/features/calendar/components/calendar-section';
import type { ProductionTask, ProductionTaskCompletion, CalendarEvent } from '@/shared/types/database';
import { toast } from 'sonner';
import {
  createProcessAction,
  updateProcessAction,
  deleteProcessAction,
  reorderProcessesAction,
  addMediaAction,
  deleteMediaAction,
} from '../actions/production-actions';
import type { ProductionProcess, ProductionMedia, ProductionColor } from '@/shared/types/database';

// ── Cores dos nós ──────────────────────────────────────────

const COLOR_OPTIONS: { value: ProductionColor; label: string }[] = [
  { value: 'violet', label: 'Violeta' },
  { value: 'blue', label: 'Azul' },
  { value: 'emerald', label: 'Verde' },
  { value: 'amber', label: 'Âmbar' },
  { value: 'rose', label: 'Rosa' },
  { value: 'slate', label: 'Cinza' },
];

const COLOR_MAP: Record<ProductionColor, {
  border: string; bg: string; badge: string; text: string; dot: string;
}> = {
  violet: { border: 'border-violet-500', bg: 'bg-violet-500/10', badge: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  blue:   { border: 'border-blue-500',   bg: 'bg-blue-500/10',   badge: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-300',   dot: 'bg-blue-500'   },
  emerald:{ border: 'border-emerald-500',bg: 'bg-emerald-500/10',badge: 'bg-emerald-500',text: 'text-emerald-700 dark:text-emerald-300',dot:'bg-emerald-500'},
  amber:  { border: 'border-amber-500',  bg: 'bg-amber-500/10',  badge: 'bg-amber-500',  text: 'text-amber-700 dark:text-amber-300',  dot: 'bg-amber-500'  },
  rose:   { border: 'border-rose-500',   bg: 'bg-rose-500/10',   badge: 'bg-rose-500',   text: 'text-rose-700 dark:text-rose-300',    dot: 'bg-rose-500'   },
  slate:  { border: 'border-slate-500',  bg: 'bg-slate-500/10',  badge: 'bg-slate-500',  text: 'text-slate-700 dark:text-slate-300',  dot: 'bg-slate-500'  },
};

// ── Helpers ────────────────────────────────────────────────

function getVideoEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

function isVideoUrl(url: string): boolean {
  return /youtube|youtu\.be|vimeo|\.mp4|\.webm/i.test(url);
}

// ── Props ──────────────────────────────────────────────────

interface ContactInfo {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

interface ProductionShellProps {
  initialProcesses: ProductionProcess[];
  initialMedia: ProductionMedia[];
  initialTasks: ProductionTask[];
  initialCompletions: ProductionTaskCompletion[];
  currentUserId: string;
  targetUserId: string;           // de quem são os processos/tarefas exibidos
  contacts: ContactInfo[];
  isAdmin: boolean;
  initialCalendarEvents: CalendarEvent[];
  googleConnected: boolean;
  googleEmail: string | null | undefined;
  googleConfigured: boolean;
  showCalendar?: boolean;
  showUserGrid?: boolean;
}

// ── Component ──────────────────────────────────────────────

export function ProductionShell({
  initialProcesses,
  initialMedia,
  initialTasks,
  initialCompletions,
  currentUserId,
  targetUserId,
  contacts,
  isAdmin,
  initialCalendarEvents,
  googleConnected,
  googleEmail,
  googleConfigured,
  showCalendar = true,
  showUserGrid = true,
}: ProductionShellProps) {
  const supabase = createClient();

  const [processes, setProcesses] = useState<ProductionProcess[]>(initialProcesses);
  const [media, setMedia] = useState<ProductionMedia[]>(initialMedia);

  // Detail modal
  const [selectedProcess, setSelectedProcess] = useState<ProductionProcess | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Create/Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<ProductionProcess | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formColor, setFormColor] = useState<ProductionColor>('violet');
  const [saving, setSaving] = useState(false);

  // Add Media modal (inside detail)
  const [addMediaOpen, setAddMediaOpen] = useState(false);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // ── Handlers: Process CRUD ─────────────────────────────

  function openCreate() {
    setEditingProcess(null);
    setFormTitle('');
    setFormDesc('');
    setFormColor('violet');
    setFormOpen(true);
  }

  function openEdit(p: ProductionProcess, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditingProcess(p);
    setFormTitle(p.title);
    setFormDesc(p.description ?? '');
    setFormColor(p.color as ProductionColor);
    setFormOpen(true);
  }

  async function handleSaveProcess() {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      if (editingProcess) {
        const res = await updateProcessAction(editingProcess.id, {
          title: formTitle,
          description: formDesc,
          color: formColor,
        });
        if (res.error) { toast.error(res.error); return; }
        setProcesses((prev) => prev.map((p) => p.id === editingProcess.id ? res.process! : p));
        toast.success('Processo atualizado');
      } else {
        const res = await createProcessAction({ title: formTitle, description: formDesc, color: formColor, assigned_to: targetUserId });
        if (res.error) { toast.error(res.error); return; }
        setProcesses((prev) => [...prev, res.process!]);
        toast.success('Processo criado');
      }
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProcess(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm('Excluir este processo?')) return;
    const res = await deleteProcessAction(id);
    if (res.error) { toast.error(res.error); return; }
    setProcesses((prev) => prev.filter((p) => p.id !== id));
    if (selectedProcess?.id === id) setDetailOpen(false);
    toast.success('Processo removido');
  }

  async function handleMove(id: string, direction: 'left' | 'right', e?: React.MouseEvent) {
    e?.stopPropagation();
    const idx = processes.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const newList = [...processes];
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newList.length) return;
    [newList[idx], newList[targetIdx]] = [newList[targetIdx], newList[idx]];
    setProcesses(newList);
    await reorderProcessesAction(newList.map((p) => p.id));
  }

  // ── Handlers: Media ────────────────────────────────────

  function openAddMedia(e?: React.MouseEvent) {
    e?.stopPropagation();
    setMediaType('image');
    setMediaUrl('');
    setMediaCaption('');
    setMediaFile(null);
    setAddMediaOpen(true);
  }

  async function handleAddMedia() {
    if (!selectedProcess) return;
    setUploadingMedia(true);
    try {
      let finalUrl = mediaUrl;

      // Upload de arquivo de imagem para o Supabase Storage
      if (mediaType === 'image' && mediaFile) {
        const ext = mediaFile.name.split('.').pop() ?? 'jpg';
        const path = `${selectedProcess.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('production-media')
          .upload(path, mediaFile, { upsert: true });
        if (upErr) { toast.error('Falha no upload: ' + upErr.message); return; }
        const { data: urlData } = supabase.storage.from('production-media').getPublicUrl(path);
        finalUrl = urlData.publicUrl;
      }

      if (!finalUrl.trim()) { toast.error('Informe a URL ou selecione um arquivo'); return; }

      const res = await addMediaAction({
        process_id: selectedProcess.id,
        type: mediaType,
        url: finalUrl,
        caption: mediaCaption,
      });
      if (res.error) { toast.error(res.error); return; }
      setMedia((prev) => [...prev, res.media!]);
      setAddMediaOpen(false);
      toast.success('Mídia adicionada');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleDeleteMedia(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm('Remover esta mídia?')) return;
    const res = await deleteMediaAction(id);
    if (res.error) { toast.error(res.error); return; }
    setMedia((prev) => prev.filter((m) => m.id !== id));
    toast.success('Mídia removida');
  }

  // ── Node component (inline) ────────────────────────────

  function ProcessNode({ process, index }: { process: ProductionProcess; index: number }) {
    const c = COLOR_MAP[process.color as ProductionColor] ?? COLOR_MAP.violet;
    const processMedia = media.filter((m) => m.process_id === process.id);
    return (
      <button
        onClick={() => { setSelectedProcess(process); setDetailOpen(true); }}
        className={`
          group relative flex flex-col items-center gap-2 p-4 rounded-xl border-2
          md:min-w-[150px] md:max-w-[190px] w-full md:w-auto flex-shrink-0
          transition-all duration-200 hover:scale-105 hover:shadow-lg
          ${c.border} ${c.bg}
        `}
      >
        {/* Número */}
        <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center ${c.badge}`}>
          {index + 1}
        </span>
        {/* Título */}
        <span className={`text-sm font-semibold text-center leading-snug ${c.text}`}>
          {process.title}
        </span>
        {/* Badge de mídias */}
        {processMedia.length > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <ImageIcon className="w-3 h-3" />{processMedia.filter((m) => m.type === 'image').length}
            <Video className="w-3 h-3 ml-1" />{processMedia.filter((m) => m.type === 'video').length}
          </span>
        )}

        {/* Controles admin — aparecem ao hover */}
        {isAdmin && (
          <div className="absolute -top-3 right-1 hidden group-hover:flex items-center gap-0.5 z-10">
            <button
              onClick={(e) => handleMove(process.id, 'left', e)}
              disabled={index === 0}
              className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted disabled:opacity-30"
              title="Mover para esquerda"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleMove(process.id, 'right', e)}
              disabled={index === processes.length - 1}
              className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted disabled:opacity-30"
              title="Mover para direita"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => openEdit(process, e)}
              className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted"
              title="Editar"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleDeleteProcess(process.id, e)}
              className="p-0.5 rounded bg-background border border-rose-300 shadow-sm hover:bg-rose-50 dark:hover:bg-rose-950"
              title="Excluir"
            >
              <Trash2 className="w-3 h-3 text-rose-500" />
            </button>
          </div>
        )}
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────

  const detailMedia = selectedProcess
    ? media.filter((m) => m.process_id === selectedProcess.id).sort((a, b) => a.order_index - b.order_index)
    : [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produção</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fluxo de processos operacionais — clique em um processo para ver detalhes
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} size="sm" className="gap-1.5 flex-shrink-0">
            <Plus className="w-4 h-4" />
            Processo
          </Button>
        )}
      </div>

      {/* ─── Fluxo ─── */}
      {processes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Workflow className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Nenhum processo cadastrado</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? 'Clique em "+ Processo" para adicionar o primeiro'
              : 'Os processos da fábrica aparecerão aqui em breve'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: horizontal com scroll */}
          <div className="hidden md:flex items-start gap-1 overflow-x-auto pb-4 pt-6">
            {processes.map((p, i) => (
              <Fragment key={p.id}>
                <ProcessNode process={p} index={i} />
                {i < processes.length - 1 && (
                  <div className="flex items-center self-center px-1 flex-shrink-0">
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </Fragment>
            ))}
            {isAdmin && (
              <div className="flex items-center self-center pl-2 flex-shrink-0">
                <button
                  onClick={openCreate}
                  className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors"
                  title="Adicionar processo"
                >
                  <Plus className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          {/* Mobile: vertical */}
          <div className="flex md:hidden flex-col items-stretch gap-1 pt-4">
            {processes.map((p, i) => (
              <Fragment key={p.id}>
                <ProcessNode process={p} index={i} />
                {i < processes.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </Fragment>
            ))}
            {isAdmin && (
              <button
                onClick={openCreate}
                className="mt-2 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground"
              >
                <Plus className="w-4 h-4" /> Adicionar processo
              </button>
            )}
          </div>
        </>
      )}

      {/* ─── Modal: Detalhe do Processo ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          {selectedProcess && (() => {
            const c = COLOR_MAP[selectedProcess.color as ProductionColor] ?? COLOR_MAP.violet;
            return (
              <>
                {/* Header colorido */}
                <div className={`px-6 py-5 rounded-t-lg border-b border-border ${c.bg}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0 ${c.badge}`}>
                      {processes.findIndex((p) => p.id === selectedProcess.id) + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className={`text-xl font-bold ${c.text}`}>
                        {selectedProcess.title}
                      </DialogTitle>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => { openEdit(selectedProcess); setDetailOpen(false); }}
                        >
                          <Pencil className="w-3 h-3" /> Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => openAddMedia()}
                        >
                          <Plus className="w-3 h-3" /> Mídia
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Corpo com scroll */}
                <ScrollArea className="flex-1 overflow-y-auto">
                  <div className="px-6 py-5 space-y-6">
                    {/* Descrição */}
                    {selectedProcess.description ? (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Descrição</h4>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedProcess.description}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Nenhuma descrição cadastrada.</p>
                    )}

                    {/* Mídias */}
                    {detailMedia.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Mídias ({detailMedia.length})
                        </h4>
                        <div className="space-y-4">
                          {detailMedia.map((m) => (
                            <div key={m.id} className="group relative rounded-lg overflow-hidden border border-border bg-muted/30">
                              {m.type === 'image' ? (
                                <img
                                  src={m.url}
                                  alt={m.caption ?? ''}
                                  className="w-full object-contain max-h-[400px]"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="aspect-video">
                                  <iframe
                                    src={getVideoEmbedUrl(m.url)}
                                    className="w-full h-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    title={m.caption ?? 'Vídeo'}
                                  />
                                </div>
                              )}
                              {m.caption && (
                                <p className="px-3 py-2 text-xs text-muted-foreground">{m.caption}</p>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={(e) => handleDeleteMedia(m.id, e)}
                                  className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-destructive-foreground"
                                  title="Remover mídia"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isAdmin && detailMedia.length === 0 && (
                      <button
                        onClick={() => openAddMedia()}
                        className="w-full flex items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground"
                      >
                        <Upload className="w-4 h-4" />
                        Adicionar imagem ou vídeo
                      </button>
                    )}
                  </div>
                </ScrollArea>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Adicionar Mídia ─── */}
      <Dialog open={addMediaOpen} onOpenChange={setAddMediaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar mídia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Tipo */}
            <div className="flex gap-2">
              {(['image', 'video'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setMediaType(t); setMediaUrl(''); setMediaFile(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                    mediaType === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  {t === 'image' ? <ImageIcon className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                  {t === 'image' ? 'Imagem' : 'Vídeo'}
                </button>
              ))}
            </div>

            {/* Imagem: upload de arquivo ou URL */}
            {mediaType === 'image' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Upload de arquivo</Label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors">
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {mediaFile ? mediaFile.name : 'Clique para selecionar (JPG, PNG, GIF, WebP)'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { setMediaFile(f); setMediaUrl(''); }
                      }}
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-1.5">
                  <Label>URL da imagem</Label>
                  <div className="flex gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground self-center" />
                    <Input
                      value={mediaUrl}
                      onChange={(e) => { setMediaUrl(e.target.value); setMediaFile(null); }}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Vídeo: URL do YouTube, Vimeo ou MP4 */}
            {mediaType === 'video' && (
              <div className="space-y-1.5">
                <Label>URL do vídeo</Label>
                <Input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="YouTube, Vimeo ou link direto (.mp4)"
                />
                <p className="text-xs text-muted-foreground">
                  Cole o link do YouTube, Vimeo ou um arquivo de vídeo direto
                </p>
              </div>
            )}

            {/* Legenda */}
            <div className="space-y-1.5">
              <Label>Legenda (opcional)</Label>
              <Input
                value={mediaCaption}
                onChange={(e) => setMediaCaption(e.target.value)}
                placeholder="Ex: Etapa de montagem do produto"
              />
            </div>

            <Button
              onClick={handleAddMedia}
              disabled={uploadingMedia || (!mediaFile && !mediaUrl.trim())}
              className="w-full"
            >
              {uploadingMedia ? 'Enviando...' : 'Adicionar mídia'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Criar / Editar Processo ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProcess ? 'Editar processo' : 'Novo processo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: Recebimento de materiais"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Descreva o que acontece nesta etapa..."
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Cor do nó</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((opt) => {
                  const c = COLOR_MAP[opt.value];
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFormColor(opt.value)}
                      title={opt.label}
                      className={`w-8 h-8 rounded-full transition-all ${c.dot} ${
                        formColor === opt.value
                          ? 'ring-2 ring-offset-2 ring-foreground scale-110'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Preview do nó */}
            <div className="flex justify-center pt-1">
              <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 w-36 ${COLOR_MAP[formColor].border} ${COLOR_MAP[formColor].bg}`}>
                <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center ${COLOR_MAP[formColor].badge}`}>
                  {editingProcess ? processes.findIndex((p) => p.id === editingProcess.id) + 1 : processes.length + 1}
                </span>
                <span className={`text-xs font-semibold text-center leading-snug ${COLOR_MAP[formColor].text}`}>
                  {formTitle || 'Preview'}
                </span>
              </div>
            </div>

            <Button
              onClick={handleSaveProcess}
              disabled={saving || !formTitle.trim()}
              className="w-full"
            >
              {saving ? 'Salvando...' : editingProcess ? 'Salvar alterações' : 'Criar processo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Separador ─── */}
      <div className="border-t border-border pt-2" />

      {/* ─── Tarefas ─── */}
      <TaskFlowSection
        initialTasks={initialTasks}
        initialCompletions={initialCompletions}
        currentUserId={currentUserId}
        targetUserId={targetUserId}
        isAdmin={isAdmin}
        showAddButton
      />

      {/* ─── Seção admin: gestão de tarefas por usuário ─── */}
      {showUserGrid && isAdmin && contacts.length > 0 && (
        <>
          <div className="border-t border-border pt-2" />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-base font-semibold">Gerenciar Tarefas por Usuário</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Clique em um usuário para entrar na página de tarefas dele e criar ou editar.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {contacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/producao/usuario/${c.id}`}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/40 transition-all group"
                >
                  <Avatar className="h-10 w-10">
                    {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.full_name} />}
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {c.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center min-w-0 w-full">
                    <p className="text-xs font-semibold truncate">{c.full_name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{c.role.replace('_', ' ')}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── Calendário ─── */}
      {showCalendar && <div className="border-t border-border pt-2" />}
      {showCalendar && (
        <CalendarSection
          initialEvents={initialCalendarEvents}
          googleConnected={googleConnected}
          googleEmail={googleEmail ?? null}
          googleConfigured={googleConfigured}
        />
      )}
    </div>
  );
}
