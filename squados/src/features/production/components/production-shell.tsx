'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Plus,
  ArrowRight,
  ArrowDown,
  Trash2,
  Image as ImageIcon,
  Video,
  ChevronLeft,
  ChevronRight,
  Workflow,
  Users,
  ExternalLink,
} from 'lucide-react';
import { TaskFlowSection } from './task-flow-section';
import type { ProductionTask, ProductionTaskCompletion, AssignedProcess, ProcessCatalogFull } from '@/shared/types/database';
import { toast } from 'sonner';
import {
  addAssignmentsAction,
  removeAssignmentAction,
  reorderAssignmentsAction,
} from '@/features/processes/actions/assignment-actions';
import { ProcessDetailModal } from '@/features/processes/components/process-detail-modal';
import { ProcessPickerModal } from '@/features/processes/components/process-picker-modal';
import { WorkflowInbox } from '@/features/workflows/components/workflow-inbox';
import { Inbox } from 'lucide-react';

// ── Cores dos nós ──────────────────────────────────────────

type ProductionColor = 'violet' | 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';

const COLOR_MAP: Record<ProductionColor, {
  border: string; bg: string; badge: string; text: string;
}> = {
  violet: { border: 'border-violet-500', bg: 'bg-violet-500/10', badge: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
  blue:   { border: 'border-blue-500',   bg: 'bg-blue-500/10',   badge: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-300'   },
  emerald:{ border: 'border-emerald-500',bg: 'bg-emerald-500/10',badge: 'bg-emerald-500',text: 'text-emerald-700 dark:text-emerald-300'},
  amber:  { border: 'border-amber-500',  bg: 'bg-amber-500/10',  badge: 'bg-amber-500',  text: 'text-amber-700 dark:text-amber-300'  },
  rose:   { border: 'border-rose-500',   bg: 'bg-rose-500/10',   badge: 'bg-rose-500',   text: 'text-rose-700 dark:text-rose-300'    },
  slate:  { border: 'border-slate-500',  bg: 'bg-slate-500/10',  badge: 'bg-slate-500',  text: 'text-slate-700 dark:text-slate-300'  },
};

// ── Props ──────────────────────────────────────────────────

interface ContactInfo {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
}

interface ProductionShellProps {
  initialAssignments: AssignedProcess[];
  initialTasks: ProductionTask[];
  initialCompletions: ProductionTaskCompletion[];
  currentUserId: string;
  targetUserId: string;
  contacts: ContactInfo[];
  isAdmin: boolean;
  showUserGrid?: boolean;
  catalogProcesses: ProcessCatalogFull[];
}

// ── Component ──────────────────────────────────────────────

export function ProductionShell({
  initialAssignments,
  initialTasks,
  initialCompletions,
  currentUserId,
  targetUserId,
  contacts,
  isAdmin,
  showUserGrid = true,
  catalogProcesses,
}: ProductionShellProps) {
  const [assignments, setAssignments] = useState<AssignedProcess[]>(initialAssignments);

  // Detail modal
  const [selectedAssignment, setSelectedAssignment] = useState<AssignedProcess | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Picker modal
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Handlers ──────────────────────────────────────────

  async function handleRemoveAssignment(assignmentId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm('Remover este processo do fluxo?')) return;
    const res = await removeAssignmentAction(assignmentId);
    if (res.error) { toast.error(res.error); return; }
    setAssignments(prev => prev.filter(a => a.assignment_id !== assignmentId));
    toast.success('Processo removido do fluxo');
  }

  async function handleMove(assignmentId: string, direction: 'left' | 'right', e?: React.MouseEvent) {
    e?.stopPropagation();
    const idx = assignments.findIndex(a => a.assignment_id === assignmentId);
    if (idx < 0) return;
    const newList = [...assignments];
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newList.length) return;
    [newList[idx], newList[targetIdx]] = [newList[targetIdx], newList[idx]];
    setAssignments(newList);
    await reorderAssignmentsAction(newList.map(a => a.assignment_id));
  }

  async function handleAddFromPicker(selectedIds: string[]) {
    const res = await addAssignmentsAction(targetUserId, selectedIds);
    if (res.error) { toast.error(res.error); return; }
    const newItems = selectedIds.map((id, i) => {
      const cat = catalogProcesses.find(p => p.id === id)!;
      return {
        assignment_id: `temp-${Date.now()}-${i}`,
        catalog_process_id: id,
        order_index: assignments.length + i,
        color: cat.color,
        title: cat.title,
        description: cat.description,
        sector_id: cat.sector_id,
        sector_name: cat.sector_name,
        media: cat.media,
      } as AssignedProcess;
    });
    setAssignments(prev => [...prev, ...newItems]);
    toast.success(`${selectedIds.length} processo(s) adicionado(s)`);
  }

  // ── Node component (inline) ────────────────────────────

  function ProcessNode({ assignment, index }: { assignment: AssignedProcess; index: number }) {
    const c = COLOR_MAP[assignment.color as ProductionColor] ?? COLOR_MAP.violet;
    return (
      <button
        onClick={() => { setSelectedAssignment(assignment); setDetailOpen(true); }}
        className={`
          group relative flex flex-col items-center gap-2 p-4 rounded-xl border-2
          md:min-w-[150px] md:max-w-[190px] w-full md:w-auto flex-shrink-0
          transition-all duration-200 hover:scale-105 hover:shadow-lg
          ${c.border} ${c.bg}
        `}
      >
        <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center ${c.badge}`}>
          {index + 1}
        </span>
        <span className={`text-sm font-semibold text-center leading-snug ${c.text}`}>
          {assignment.title}
        </span>
        {assignment.sector_name && (
          <span className="text-[10px] text-muted-foreground">{assignment.sector_name}</span>
        )}
        {assignment.media.length > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <ImageIcon className="w-3 h-3" />{assignment.media.filter(m => m.type === 'image').length}
            <Video className="w-3 h-3 ml-1" />{assignment.media.filter(m => m.type === 'video').length}
          </span>
        )}

        {isAdmin && (
          <div className="absolute -top-3 right-1 hidden group-hover:flex items-center gap-0.5 z-10">
            <button
              onClick={(e) => handleMove(assignment.assignment_id, 'left', e)}
              disabled={index === 0}
              className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted disabled:opacity-30"
              title="Mover para esquerda"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleMove(assignment.assignment_id, 'right', e)}
              disabled={index === assignments.length - 1}
              className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted disabled:opacity-30"
              title="Mover para direita"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleRemoveAssignment(assignment.assignment_id, e)}
              className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-destructive hover:text-destructive-foreground"
              title="Remover do fluxo"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Produção</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Fluxo de processos operacionais — clique em um processo para ver detalhes
        </p>
      </div>

      {/* Caixa de Entrada removida — workflow_steps agora aparecem apenas em /operations */}

      {/* ─── Fluxo de processos ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Workflow className="w-4 h-4" /> Fluxo de Processos
          </h3>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className="gap-1.5 h-8 text-xs">
              <Plus className="w-3.5 h-3.5" /> Processo
            </Button>
          )}
        </div>

        {assignments.length === 0 ? (
          <div className="flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground">
            {isAdmin ? 'Clique em "+ Processo" para adicionar ao fluxo' : 'Nenhum processo atribuído'}
          </div>
        ) : (
          <>
            {/* Desktop: horizontal com scroll */}
            <div className="hidden md:flex items-start gap-1 overflow-x-auto pb-4 pt-6">
              {assignments.map((a, i) => (
                <Fragment key={a.assignment_id}>
                  <ProcessNode assignment={a} index={i} />
                  {i < assignments.length - 1 && (
                    <div className="flex items-center self-center px-1 flex-shrink-0">
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>

            {/* Mobile: vertical */}
            <div className="flex md:hidden flex-col items-stretch gap-1 pt-4">
              {assignments.map((a, i) => (
                <Fragment key={a.assignment_id}>
                  <ProcessNode assignment={a} index={i} />
                  {i < assignments.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </>
        )}
      </div>

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

      {/* ─── Detail modal ─── */}
      {selectedAssignment && (
        <ProcessDetailModal
          process={{
            id: selectedAssignment.catalog_process_id,
            sector_id: selectedAssignment.sector_id,
            title: selectedAssignment.title,
            description: selectedAssignment.description,
            color: selectedAssignment.color,
            is_active: true,
            created_by: null,
            created_at: '',
            updated_at: '',
            sector_name: selectedAssignment.sector_name,
            sector_icon: null,
            media: selectedAssignment.media,
          }}
          open={detailOpen}
          onClose={() => { setDetailOpen(false); setSelectedAssignment(null); }}
        />
      )}

      {/* ─── Picker modal ─── */}
      <ProcessPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        catalogProcesses={catalogProcesses}
        alreadyAssignedIds={assignments.map(a => a.catalog_process_id)}
        onConfirm={handleAddFromPicker}
      />
    </div>
  );
}
