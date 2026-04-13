'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{procedure.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
