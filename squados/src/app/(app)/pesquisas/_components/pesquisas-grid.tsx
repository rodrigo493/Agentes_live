'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PesquisaDoc, PesquisaDrawer } from './pesquisa-drawer';
import { extractTema, getTemaConfig, TEMA_CONFIG } from './tema-config';

interface PesquisasGridProps {
  pesquisas: PesquisaDoc[];
}

export function PesquisasGrid({ pesquisas }: PesquisasGridProps) {
  const [filtroTema, setFiltroTema] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<PesquisaDoc | null>(null);

  const temas = Array.from(new Set(pesquisas.map((p) => extractTema(p.title))));

  const filtradas = filtroTema
    ? pesquisas.filter((p) => extractTema(p.title) === filtroTema)
    : pesquisas;

  return (
    <>
      {temas.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFiltroTema(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filtroTema === null
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted-foreground border-border hover:border-foreground'
            }`}
          >
            Todos ({pesquisas.length})
          </button>
          {temas.map((tema) => {
            const config = getTemaConfig(tema);
            const count = pesquisas.filter((p) => extractTema(p.title) === tema).length;
            const isActive = filtroTema === tema;
            return (
              <button
                key={tema}
                onClick={() => setFiltroTema(isActive ? null : tema)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? `${config.bgClass} ${config.textClass} ${config.borderClass}`
                    : 'bg-background text-muted-foreground border-border hover:border-foreground'
                }`}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma pesquisa encontrada.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtradas.map((pesquisa) => {
            const tema = extractTema(pesquisa.title);
            const config = getTemaConfig(tema);
            const dataFormatada = new Date(pesquisa.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
            const preview = pesquisa.content.slice(0, 180).trim();

            return (
              <div
                key={pesquisa.id}
                className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:border-foreground/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge className={`${config.bgClass} ${config.textClass} border ${config.borderClass} text-xs`}>
                    {config.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0">{dataFormatada}</span>
                </div>
                <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
                  {pesquisa.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed flex-1">
                  {preview}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-auto"
                  onClick={() => setSelecionada(pesquisa)}
                >
                  Ler
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <PesquisaDrawer pesquisa={selecionada} onClose={() => setSelecionada(null)} />
    </>
  );
}
