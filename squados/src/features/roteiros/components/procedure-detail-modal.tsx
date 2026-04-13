'use client';

import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, ChevronLeft, ChevronRight, Volume2, Pause, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AssemblyProcedureFull } from '@/shared/types/database';

interface Props {
  procedure: AssemblyProcedureFull;
  open: boolean;
  onClose: () => void;
}

export function ProcedureDetailModal({ procedure, open, onClose }: Props) {
  const images = procedure.media.filter((m) => m.type === 'image');
  const pdfs   = procedure.media.filter((m) => m.type === 'pdf');
  const [idx, setIdx] = useState(0);
  const current = images[idx];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingTts, setLoadingTts] = useState(false);
  const [playing, setPlaying] = useState(false);

  async function handleListen() {
    if (audioUrl && audioRef.current) {
      if (playing) { audioRef.current.pause(); setPlaying(false); }
      else { audioRef.current.play(); setPlaying(true); }
      return;
    }

    setLoadingTts(true);
    try {
      const text = [
        procedure.title,
        procedure.description ?? '',
        procedure.procedure_text,
      ].filter(Boolean).join('. ');

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 5000) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Falha na síntese (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play();
          setPlaying(true);
        }
      }, 50);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingTts(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>{procedure.title}</span>
            <Button size="sm" variant="outline" onClick={handleListen} disabled={loadingTts} className="gap-1.5">
              {loadingTts ? <Loader2 className="w-4 h-4 animate-spin" /> :
               playing    ? <Pause className="w-4 h-4" /> :
                            <Volume2 className="w-4 h-4" />}
              {loadingTts ? 'Gerando…' : playing ? 'Pausar' : 'Ouvir'}
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <audio
            ref={audioRef}
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            className="hidden"
          />
          {procedure.description && (
            <p className="text-sm text-muted-foreground">{procedure.description}</p>
          )}

          {images.length > 0 && current && (
            <div className="relative border rounded-lg overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.url} alt={current.caption ?? ''} className="w-full max-h-[400px] object-contain" />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/90 p-2 rounded-full border"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIdx((i) => (i + 1) % images.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/90 p-2 rounded-full border"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] bg-background/90 px-2 py-0.5 rounded border">
                    {idx + 1} / {images.length}
                  </div>
                </>
              )}
              {current.caption && (
                <p className="text-xs bg-background/90 px-3 py-1.5 border-t">{current.caption}</p>
              )}
            </div>
          )}

          <div className="border rounded-lg p-4 bg-muted/20">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Procedimento</h4>
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{procedure.procedure_text}</pre>
          </div>

          {pdfs.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Documentos PDF</h4>
              {pdfs.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-2 border rounded p-2 hover:bg-muted/30 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span>{p.caption || 'Documento'}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
