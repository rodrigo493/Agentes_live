'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Trash2, Loader2, TriangleAlert, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteWorkItemAction } from '../actions/pasta-actions';
import type { WorkItemView } from '../actions/pasta-actions';

interface Props {
  item: WorkItemView;
  showAssignee?: boolean;
  isAdmin?: boolean;
  onAdvance: (stepId: string, targetStepTitle?: string) => Promise<void>;
  onOpenNotes: (item: WorkItemView) => void;
  onDeleted?: () => void;
}

function computeSlaState(item: WorkItemView) {
  if (!item.due_at) return { label: '—', state: 'none' as const };
  const now = Date.now();
  const dueMs = new Date(item.due_at).getTime();
  const diffMs = dueMs - now;
  const slaMs = item.sla_hours * 3_600_000;

  if (diffMs < 0) {
    const h = Math.floor(Math.abs(diffMs) / 3_600_000);
    const m = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
    return { label: `${h}h${m > 0 ? `${m}m` : ''}`, state: 'overdue' as const };
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffMs / slaMs <= 0.5) {
    return { label: `${h}h${m > 0 ? `${m}m` : ''}`, state: 'warning' as const };
  }
  return { label: `${h}h${m > 0 ? `${m}m` : ''}`, state: 'ok' as const };
}

function SlaChip({ sla }: { sla: ReturnType<typeof computeSlaState> }) {
  if (sla.state === 'none') return null;
  if (sla.state === 'overdue') return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
      🔥 Esfriando {sla.label}
    </span>
  );
  if (sla.state === 'warning') return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
      🔥 Esfriando {sla.label}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      ✓ {sla.label}
    </span>
  );
}

function ObservacoesCardButton({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold text-amber-900 transition-all hover:brightness-110"
        style={{
          background: 'linear-gradient(135deg, #fef08a 0%, #fde047 100%)',
          border: '1.5px solid #f97316',
          animation: 'obs-border-pulse 1.8s ease-in-out infinite',
        }}
      >
        <TriangleAlert className="h-3 w-3 shrink-0 text-orange-500" style={{ filter: 'drop-shadow(0 0 3px #f97316)' }} />
        Obs. Pós-Venda
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-orange-500" style={{ animation: 'obs-dot-pulse 1.8s ease-in-out infinite', boxShadow: '0 0 4px #f97316' }} />
      </button>
      <style>{`
        @keyframes obs-border-pulse {
          0%, 100% { box-shadow: 0 0 4px 1px rgba(249,115,22,0.5); border-color: #f97316; }
          50% { box-shadow: 0 0 10px 3px rgba(249,115,22,0.85); border-color: #fb923c; }
        }
        @keyframes obs-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative w-full max-w-md rounded-2xl border-2 border-amber-400 bg-zinc-900 shadow-2xl p-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-900/40">
                <TriangleAlert className="h-5 w-5 text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-zinc-100">Observações do Pós-Venda</h3>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{notes}</p>
          </div>
        </div>
      )}
    </>
  );
}

export function KanbanCard({ item, showAssignee, isAdmin, onAdvance, onOpenNotes, onDeleted }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sla = computeSlaState(item);

  const isForkBlocked = item.block_reason_code === 'FORK_PENDING';
  const isUnblocked = !!item.unblocked_at &&
    (Date.now() - new Date(item.unblocked_at).getTime() < 30 * 60 * 1000);
  const branches = item.branch_options ?? [];

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Excluir card "${item.reference}"? Todas as etapas e anexos serão removidos.`)) return;
    setDeleting(true);
    try {
      const r = await deleteWorkItemAction(item.instance_id);
      if (r.error) { toast.error(r.error); return; }
      toast.success(`Card ${item.reference} excluído`);
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  async function handleAdvance(noteText?: string, targetTitle?: string) {
    setAdvancing(true);
    try { await onAdvance(item.step_id, targetTitle); } finally { setAdvancing(false); }
  }

  function renderAdvanceArea() {
    if (advancing) {
      return (
        <div className="flex justify-center py-1">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      );
    }

    if (isForkBlocked) {
      return (
        <div className="flex items-center gap-1.5 text-amber-400 text-xs py-1">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Aguardando fluxo paralelo</span>
        </div>
      );
    }

    if (branches.length > 0) {
      return (
        <div className="flex flex-wrap gap-1 mt-1">
          {branches.map(branch => (
            <button
              key={branch.target_title}
              type="button"
              onClick={() => handleAdvance(undefined, branch.target_title)}
              className="text-xs px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-600/40 transition-colors"
            >
              → {branch.label}
            </button>
          ))}
        </div>
      );
    }

    if (item.next_step_title) {
      return (
        <Button
          size="sm" variant="ghost"
          className="flex-1 h-7 text-[11px] font-semibold px-2 gap-1 text-zinc-300 hover:text-white hover:bg-zinc-700/80"
          onClick={() => handleAdvance()}
        >
          <ChevronRight className="w-3 h-3" />{item.next_step_title}
        </Button>
      );
    }

    return (
      <Button
        size="sm" variant="ghost"
        className="flex-1 h-7 text-[11px] font-semibold px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30"
        onClick={() => handleAdvance()}
      >
        ✓ {item.complete_label ?? 'Concluir'}
      </Button>
    );
  }

  return (
    <div
      className={`rounded-xl border bg-zinc-800/80 p-3 space-y-2 shadow-sm transition-colors ${
        isUnblocked
          ? 'border-lime-400 shadow-lime-400/40 shadow-lg'
          : 'border-zinc-700/70 hover:border-zinc-600/80'
      }`}
      style={isUnblocked ? { animation: 'liberated-glow 2s ease-in-out infinite' } : undefined}
    >
      {/* LIBERADO animation */}
      {isUnblocked && (
        <>
          <style>{`
            @keyframes liberated-glow {
              0%, 100% { box-shadow: 0 0 8px 2px rgba(163, 230, 53, 0.4); }
              50% { box-shadow: 0 0 20px 6px rgba(163, 230, 53, 0.6); }
            }
          `}</style>
          <div className="flex justify-center mb-1.5">
            <span className="animate-pulse text-xs font-bold px-2 py-0.5 rounded bg-lime-400/15 text-lime-400 border border-lime-400/30">
              ✓ LIBERADO
            </span>
          </div>
        </>
      )}

      {/* Linha de status + SLA */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          <span className="text-[10px] text-zinc-500">Em andamento</span>
        </div>
        <div className="flex items-center gap-1">
          <SlaChip sla={sla} />
          {isAdmin && (
            <Button
              size="sm" variant="ghost"
              className="h-5 w-5 p-0 text-zinc-600 hover:text-red-400 hover:bg-red-900/20"
              onClick={handleDelete}
              disabled={deleting}
              title="Excluir card"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </Button>
          )}
        </div>
      </div>

      {/* Título + responsável */}
      <Link href={`/operations/card/${item.step_id}`} target="_blank" className="block group">
        <p className="text-[13px] font-bold text-zinc-100 leading-snug group-hover:text-white">
          {item.reference}
        </p>
        {showAssignee && item.assignee_name && (
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{item.assignee_name}</p>
        )}
      </Link>

      {/* Obs. Pós-Venda */}
      {item.posvenda_notes && (
        <ObservacoesCardButton notes={item.posvenda_notes} />
      )}

      {/* Ações */}
      <div className="flex gap-1 pt-1 border-t border-zinc-700/40">
        {renderAdvanceArea()}
        {!isForkBlocked && (
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/80"
            onClick={() => onOpenNotes(item)}
            title="Notas"
          >
            <FileText className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
