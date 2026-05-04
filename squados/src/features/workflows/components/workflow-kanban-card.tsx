'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Trash2, Loader2, TriangleAlert, X, GitFork } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteWorkItemAction } from '../actions/pasta-actions';
import type { WorkItemView, BranchOption } from '../actions/pasta-actions';

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

function BranchDialog({
  branches, onSelect, onClose, advancing,
}: {
  branches: BranchOption[];
  onSelect: (t: string) => void;
  onClose: () => void;
  advancing: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-xs rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <GitFork className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-bold text-zinc-100">Para onde avançar?</h3>
        </div>
        <div className="space-y-2">
          {branches.map((b) => (
            <button
              key={b.target_title}
              type="button"
              disabled={advancing}
              onClick={() => onSelect(b.target_title)}
              className="w-full flex items-center gap-2 rounded-xl border border-violet-500/30 hover:border-violet-500 bg-violet-500/10 hover:bg-violet-500/20 px-4 py-2.5 text-sm font-semibold text-left text-zinc-200 transition-all disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4 shrink-0 text-violet-400" />
              {b.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function KanbanCard({ item, showAssignee, isAdmin, onAdvance, onOpenNotes, onDeleted }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const sla = computeSlaState(item);

  const branches = item.branch_options;
  const hasBranches = !!branches && branches.length >= 2;
  const singleBranch = branches?.length === 1 ? branches[0] : null;

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

  async function handleAdvanceDirect(targetTitle?: string) {
    setAdvancing(true);
    setShowBranchDialog(false);
    try { await onAdvance(item.step_id, targetTitle); } finally { setAdvancing(false); }
  }

  function renderAdvanceButton() {
    const baseCls = 'flex-1 h-7 text-[11px] font-semibold px-2 gap-1 text-zinc-300 hover:text-white hover:bg-zinc-700/80';

    if (advancing) return (
      <Button size="sm" variant="ghost" disabled className={baseCls}>
        <Loader2 className="w-3 h-3 animate-spin" />
      </Button>
    );

    if (hasBranches) return (
      <Button size="sm" variant="ghost" className={baseCls} onClick={() => setShowBranchDialog(true)}>
        <GitFork className="w-3 h-3" /> Avançar…
      </Button>
    );

    if (singleBranch) return (
      <Button size="sm" variant="ghost" className={baseCls} onClick={() => handleAdvanceDirect(singleBranch.target_title)}>
        <ChevronRight className="w-3 h-3" />{singleBranch.label}
      </Button>
    );

    if (item.next_step_title) return (
      <Button size="sm" variant="ghost" className={baseCls} onClick={() => handleAdvanceDirect()}>
        <ChevronRight className="w-3 h-3" />{item.next_step_title}
      </Button>
    );

    return (
      <Button size="sm" variant="ghost"
        className="flex-1 h-7 text-[11px] font-semibold px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30"
        onClick={() => handleAdvanceDirect()}
      >
        ✓ {item.complete_label ?? 'Concluir'}
      </Button>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-700/70 bg-zinc-800/80 p-3 space-y-2 shadow-sm hover:border-zinc-600/80 transition-colors">

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
          {renderAdvanceButton()}
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/80"
            onClick={() => onOpenNotes(item)}
            title="Notas"
          >
            <FileText className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {showBranchDialog && hasBranches && (
        <BranchDialog
          branches={branches}
          advancing={advancing}
          onSelect={(t) => handleAdvanceDirect(t)}
          onClose={() => setShowBranchDialog(false)}
        />
      )}
    </>
  );
}
