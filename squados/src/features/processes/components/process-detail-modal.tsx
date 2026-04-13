'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Video, X } from 'lucide-react';
import type { ProcessCatalogFull } from '@/shared/types/database';

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

interface ProcessDetailModalProps {
  process: ProcessCatalogFull | null;
  open: boolean;
  onClose: () => void;
}

export function ProcessDetailModal({ process, open, onClose }: ProcessDetailModalProps) {
  const [mediaIdx, setMediaIdx] = useState(0);

  if (!process) return null;
  const sortedMedia = [...process.media].sort((a, b) => a.order_index - b.order_index);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg [&>button]:hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-base font-bold leading-snug">{process.title}</DialogTitle>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        {process.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{process.description}</p>
        )}

        {sortedMedia.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />{sortedMedia.filter(m => m.type === 'image').length}
                <Video className="w-3 h-3 ml-2" />{sortedMedia.filter(m => m.type === 'video').length}
              </span>
              <span>{mediaIdx + 1} / {sortedMedia.length}</span>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-muted aspect-video">
              {(() => {
                const m = sortedMedia[mediaIdx];
                if (!m) return null;
                if (m.type === 'video' || isVideoUrl(m.url)) {
                  return (
                    <iframe
                      src={getVideoEmbedUrl(m.url)}
                      className="w-full h-full"
                      allowFullScreen
                      title={m.caption ?? 'vídeo'}
                    />
                  );
                }
                return <img src={m.url} alt={m.caption ?? ''} className="w-full h-full object-contain" />;
              })()}
            </div>
            {sortedMedia.length > 1 && (
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setMediaIdx(i => Math.max(0, i - 1))} disabled={mediaIdx === 0}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMediaIdx(i => Math.min(sortedMedia.length - 1, i + 1))} disabled={mediaIdx === sortedMedia.length - 1}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            {sortedMedia[mediaIdx]?.caption && (
              <p className="text-xs text-center text-muted-foreground">{sortedMedia[mediaIdx].caption}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
