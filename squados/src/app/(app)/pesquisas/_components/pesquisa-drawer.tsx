'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { extractTema, getTemaConfig } from './tema-config';

export interface PesquisaDoc {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface PesquisaDrawerProps {
  pesquisa: PesquisaDoc | null;
  onClose: () => void;
}

export function PesquisaDrawer({ pesquisa, onClose }: PesquisaDrawerProps) {
  const open = pesquisa !== null;
  const tema = pesquisa ? extractTema(pesquisa.title) : 'OUTROS';
  const temaConfig = getTemaConfig(tema);
  const dataFormatada = pesquisa
    ? new Date(pesquisa.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[40%] sm:max-w-none overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${temaConfig.bgClass} ${temaConfig.textClass} border ${temaConfig.borderClass}`}>
              {temaConfig.label}
            </Badge>
            <span className="text-xs text-muted-foreground">{dataFormatada}</span>
          </div>
          <SheetTitle className="text-left mt-2">{pesquisa?.title}</SheetTitle>
        </SheetHeader>
        <div className="p-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {pesquisa?.content}
        </div>
      </SheetContent>
    </Sheet>
  );
}
