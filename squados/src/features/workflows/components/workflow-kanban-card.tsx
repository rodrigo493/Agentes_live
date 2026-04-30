'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, ExternalLink, Trash2, Loader2, TriangleAlert, X, GitFork } from 'lucide-react';
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
  if (!item.due_at) return { label: '—', color: 'text-zinc-500', state: 'none' as const };
  const now = Date.now();
  const dueMs = new Date(item.due_at).getTime();
  const diffMs = dueMs - now;
  const slaMs = item.sla_hours * 3_600_000;

  if (diffMs < 0) {
    const h = Math.floor(Math.abs(diffMs) / 3_600_000);
    const m = Math.floor((Math.abs(diffMs) % 3_600_000) / 60_000);
    return { label: `+${h}h${m}m`, color: 'text-red-600', state: 'overdue' as const };
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  if (diffMs / slaMs <= 0.5) {
    return { label: `${h}h${m}m`, color: 'text-yellow-600', state: 'warning' as const };
  }
  return { label: `${h}h${m}m`, color: 'text-emerald-600', state: 'ok' as const };
}

function ObservacoesCardButton({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="w-full flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold text-amber-900 transition-all hover:brightness-110"
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
          <div className="relative w-full max-w-md rounded-2xl border-2 border-amber-400 bg-white dark:bg-zinc-900 shadow-2xl p-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Observações do Pós-Venda
              </h3>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {notes}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function BranchDialog({
  branches,
  onSelect,
  onClose,
  advancing,
}: {
  branches: BranchOption[];
  onSelect: (targetTitle: string) => void;
  onClose: () => void;
  advancing: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-xs rounded-2xl border bg-white dark:bg-zinc-900 shadow-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <GitFork className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Para onde avançar?</h3>
        </div>
        <div className="space-y-2">
          {branches.map((b) => (
            <button
              key={b.target_title}
              type="button"
              disabled={advancing}
              onClick={() => onSelect(b.target_title)}
              className="w-full flex items-center gap-2 rounded-xl border-2 border-primary/20 hover:border-primary bg-primary/5 hover:bg-primary/10 px-4 py-2.5 text-sm font-semibold text-left transition-all disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
              {b.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
        >
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

  const borderClass =
    sla.state === 'overdue' ? 'border-red-500 animate-card-border-pulse' :
    sla.state === 'warning' ? 'border-yellow-500' :
    sla.state === 'ok' ? 'border-emerald-500' :
    'border-zinc-300';

  async function handleAdvanceDirect(targetTitle?: string) {
    setAdvancing(true);
    setShowBranchDialog(false);
    try { await onAdvance(item.step_id, targetTitle); } finally { setAdvancing(false); }
  }

  function renderAdvanceButton() {
    if (advancing) {
      return (
        <Button size="sm" variant="ghost" disabled
          className="flex-1 h-6 text-[10px] font-semibold text-gray-700 px-2"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
        </Button>
      );
    }

    if (hasBranches) {
      return (
        <Button size="sm" variant="ghost"
          className="flex-1 h-6 text-[10px] font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-200 px-2 gap-0.5"
          onClick={() => setShowBranchDialog(true)}
        >
          <GitFork className="w-3 h-3" /> Avançar…
        </Button>
      );
    }

    if (singleBranch) {
      return (
        <Button size="sm" variant="ghost"
          className="flex-1 h-6 text-[10px] font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-200 px-2 gap-0.5"
          onClick={() => handleAdvanceDirect(singleBranch.target_title)}
        >
          <ChevronRight className="w-3 h-3" />{singleBranch.label}
        </Button>
      );
    }

    if (item.next_step_title) {
      return (
        <Button size="sm" variant="ghost"
          className="flex-1 h-6 text-[10px] font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-200 px-2 gap-0.5"
          onClick={() => handleAdvanceDirect()}
        >
          <ChevronRight className="w-3 h-3" />{item.next_step_title}
        </Button>
      );
    }

    return (
      <Button size="sm" variant="ghost"
        className="flex-1 h-6 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 px-2"
        onClick={() => handleAdvanceDirect()}
      >
        ✓ {item.complete_label ?? 'Concluir'}
      </Button>
    );
  }

  return (
    <>
      <div className={`rounded-lg border-2 ${borderClass} bg-gray-100 px-3 py-2.5 space-y-1.5 shadow-sm`}>
        <Link
          href={`/operations/card/${item.step_id}`}
          target="_blank"
          className="flex items-start justify-between gap-1 group"
        >
          <p className="text-sm font-bold text-gray-900 leading-tight group-hover:underline">
            {item.reference}
          </p>
          <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-gray-700 flex-shrink-0 mt-0.5" />
        </Link>

        <div className="flex items-center justify-between gap-1 text-[11px]">
          {showAssignee && item.assignee_name ? (
            <span className="text-gray-600 truncate max-w-[70%]">{item.assignee_name}</span>
          ) : (
            <span />
          )}
          <span className={`font-semibold shrink-0 ${sla.color}`}>{sla.label}</span>
        </div>

        {item.posvenda_notes && (
          <ObservacoesCardButton notes={item.posvenda_notes} />
        )}

        <div className="flex gap-1 pt-0.5">
          {renderAdvanceButton()}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-200"
            onClick={() => onOpenNotes(item)}
          >
            <FileText className="w-3 h-3" />
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
              onClick={handleDelete}
              disabled={deleting}
              title="Excluir card (admin)"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </Button>
          )}
        </div>
      </div>

      {showBranchDialog && hasBranches && (
        <BranchDialog
          branches={branches}
          advancing={advancing}
          onSelect={(targetTitle) => handleAdvanceDirect(targetTitle)}
          onClose={() => setShowBranchDialog(false)}
        />
      )}
    </>
  );
}
