'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Plus, FileText, Image as ImageIcon, ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProcedureEditorModal } from './procedure-editor-modal';
import { ProcedureDetailModal } from './procedure-detail-modal';
import {
  listProceduresBySectorAction,
  getProceduresCountPerSectorAction,
  deleteProcedureAction,
} from '../actions/assembly-actions';
import type { AssemblyProcedureFull, Sector } from '@/shared/types/database';

interface Props {
  sectors: Sector[];
  isAdmin: boolean;
}

export function RoteirosShell({ sectors, isAdmin }: Props) {
  const [activeSector, setActiveSector] = useState<Sector | null>(null);
  const [procedures, setProcedures] = useState<AssemblyProcedureFull[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AssemblyProcedureFull | null>(null);
  const [detail, setDetail] = useState<AssemblyProcedureFull | null>(null);

  useEffect(() => {
    getProceduresCountPerSectorAction().then((r) => r.counts && setCounts(r.counts));
  }, []);

  async function openSector(s: Sector) {
    setActiveSector(s);
    setLoading(true);
    const r = await listProceduresBySectorAction(s.id);
    if (r.procedures) setProcedures(r.procedures);
    setLoading(false);
  }

  async function handleDelete(p: AssemblyProcedureFull) {
    if (!confirm(`Excluir roteiro "${p.title}"? Ele também sairá da base de conhecimento.`)) return;
    const r = await deleteProcedureAction(p.id);
    if (r.error) return toast.error(r.error);
    toast.success('Roteiro excluído');
    setProcedures((prev) => prev.filter((x) => x.id !== p.id));
    setCounts((prev) => ({ ...prev, [p.sector_id]: Math.max(0, (prev[p.sector_id] ?? 1) - 1) }));
  }

  const sortedSectors = useMemo(
    () => [...sectors].sort((a, b) => a.name.localeCompare(b.name)),
    [sectors]
  );

  if (!activeSector) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> Roteiros de Montagem
          </h1>
          <p className="text-sm text-muted-foreground">
            Cada roteiro cadastrado alimenta automaticamente o agente de IA do respectivo setor.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {sortedSectors.map((s) => (
            <button
              key={s.id}
              onClick={() => openSector(s)}
              className="text-left border rounded-lg p-4 hover:border-primary hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {s.icon && <span className="text-xl">{s.icon}</span>}
                <h3 className="font-semibold text-sm">{s.name}</h3>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {counts[s.id] ?? 0} roteiro{(counts[s.id] ?? 0) === 1 ? '' : 's'}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveSector(null)} className="gap-1">
            <ChevronLeft className="w-4 h-4" /> Setores
          </Button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {activeSector.icon && <span>{activeSector.icon}</span>} {activeSector.name}
          </h1>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> Novo Roteiro
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-10">Carregando…</div>
      ) : procedures.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          Nenhum roteiro cadastrado para {activeSector.name}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {procedures.map((p) => {
            const firstImg = p.media.find((m) => m.type === 'image');
            const pdfCount = p.media.filter((m) => m.type === 'pdf').length;
            const imgCount = p.media.filter((m) => m.type === 'image').length;
            return (
              <div key={p.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                <button onClick={() => setDetail(p)} className="w-full text-left">
                  {firstImg ? (
                    <div className="aspect-video bg-muted overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={firstImg.url} alt={p.title} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-video bg-muted/40 flex items-center justify-center">
                      <BookOpen className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm line-clamp-1">{p.title}</h3>
                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      {imgCount > 0 && (
                        <span className="flex items-center gap-0.5"><ImageIcon className="w-3 h-3" />{imgCount}</span>
                      )}
                      {pdfCount > 0 && (
                        <span className="flex items-center gap-0.5"><FileText className="w-3 h-3" />{pdfCount}</span>
                      )}
                    </div>
                  </div>
                </button>
                {isAdmin && (
                  <div className="border-t p-2 flex gap-1 justify-end bg-muted/20">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setEditorOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <ProcedureEditorModal
          sectorId={activeSector.id}
          procedure={editing}
          open={editorOpen}
          onClose={() => { setEditorOpen(false); setEditing(null); }}
          onSaved={(saved) => {
            setProcedures((prev) => {
              const idx = prev.findIndex((x) => x.id === saved.id);
              if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
              setCounts((c) => ({ ...c, [saved.sector_id]: (c[saved.sector_id] ?? 0) + 1 }));
              return [saved, ...prev];
            });
          }}
        />
      )}

      {detail && (
        <ProcedureDetailModal
          procedure={detail}
          open={!!detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
