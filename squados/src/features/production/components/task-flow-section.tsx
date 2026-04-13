'use client';

import { useState, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  ArrowRight,
  ArrowDown,
  Pencil,
  Trash2,
  Check,
  RefreshCw,
  Clock,
  CalendarDays,
  Repeat2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  completeTaskAction,
  uncompleteTaskAction,
  makeRecurringAction,
} from '../actions/task-actions';
import type { ProductionTask, ProductionTaskCompletion, TaskFrequency } from '@/shared/types/database';

// ── Helpers ────────────────────────────────────────────────

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAY_FULL   = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(t: string) {
  return t.slice(0, 5); // "HH:MM"
}

function isCompletedToday(
  taskId: string,
  completions: ProductionTaskCompletion[]
): boolean {
  const today = todayIso();
  return completions.some((c) => c.task_id === taskId && c.completion_date === today);
}

function isCompletedThisWeek(
  taskId: string,
  completions: ProductionTaskCompletion[]
): boolean {
  return completions.some((c) => c.task_id === taskId);
}

function isOverdue(task: ProductionTask, completions: ProductionTaskCompletion[]): boolean {
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const taskTime = formatTime(task.scheduled_time);

  if (task.frequency === 'daily') {
    return !isCompletedToday(task.id, completions) && taskTime < nowTime;
  }
  if (task.frequency === 'weekly') {
    const todayDay = now.getDay();
    if (task.scheduled_day !== todayDay) return false;
    return !isCompletedThisWeek(task.id, completions) && taskTime < nowTime;
  }
  if (task.frequency === 'once' && task.scheduled_date) {
    const today = todayIso();
    if (task.scheduled_date > today) return false;
    if (task.scheduled_date < today) return !isCompletedToday(task.id, completions);
    return !isCompletedToday(task.id, completions) && taskTime < nowTime;
  }
  return false;
}

// ── Task Node Component ────────────────────────────────────

interface TaskNodeProps {
  task: ProductionTask;
  completions: ProductionTaskCompletion[];
  canEdit: boolean;
  canComplete: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRepeat: () => void;
  onView: () => void;
}

function TaskNode({ task, completions, canEdit, canComplete, onToggle, onEdit, onDelete, onRepeat, onView }: TaskNodeProps) {
  const done = task.frequency === 'weekly'
    ? isCompletedThisWeek(task.id, completions)
    : isCompletedToday(task.id, completions);
  const overdue = !done && isOverdue(task, completions);

  const statusCls = done
    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : overdue
    ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300'
    : 'border-border bg-card text-foreground';

  return (
    <div
      onClick={onView}
      className={`group relative flex flex-col gap-1.5 p-3 rounded-xl border-2 flex-shrink-0 md:w-[160px] w-full transition-all cursor-pointer hover:shadow-md ${statusCls}`}
    >
      {/* Status icon */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold flex items-center gap-1">
          <Clock className="w-3 h-3 flex-shrink-0" />
          {formatTime(task.scheduled_time)}
          {task.frequency === 'weekly' && task.scheduled_day !== null && (
            <span className="ml-1 text-[10px] opacity-70">{DAY_LABELS[task.scheduled_day]}</span>
          )}
          {task.frequency === 'once' && task.scheduled_date && (
            <span className="ml-1 text-[10px] opacity-70">
              {new Date(task.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
        </span>
        {done && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
        {overdue && <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />}
      </div>

      {/* Title */}
      <p className={`text-xs font-semibold leading-snug line-clamp-2 ${done ? 'line-through opacity-60' : ''}`}>
        {task.title}
      </p>

      {/* Frequency badge */}
      {task.frequency !== 'once' && (
        <div className="flex items-center gap-1">
          <Repeat2 className="w-2.5 h-2.5 opacity-40" />
          <span className="text-[10px] opacity-50">
            {task.frequency === 'daily' ? 'Diária' : 'Semanal'}
          </span>
        </div>
      )}

      {/* Hover actions */}
      <div className="absolute -top-3 right-1 hidden group-hover:flex items-center gap-0.5 z-10">
        {canComplete && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={`p-0.5 rounded shadow-sm border text-[10px] font-bold ${
              done
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950'
                : 'bg-background border-border hover:bg-muted'
            }`}
            title={done ? 'Desfazer conclusão' : 'Marcar como concluída'}
          >
            <Check className="w-3 h-3" />
          </button>
        )}
        {canEdit && task.frequency === 'once' && (
          <button
            onClick={(e) => { e.stopPropagation(); onRepeat(); }}
            className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted"
            title="Tornar recorrente"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
        {canEdit && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted" title="Editar">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-0.5 rounded bg-background border border-rose-300 shadow-sm hover:bg-rose-50 dark:hover:bg-rose-950" title="Excluir">
              <Trash2 className="w-3 h-3 text-rose-500" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Flow Row ───────────────────────────────────────────────

interface FlowRowProps {
  label: string;
  icon: React.ReactNode;
  tasks: ProductionTask[];
  completions: ProductionTaskCompletion[];
  canEdit: boolean;
  canComplete: boolean;
  onToggle: (t: ProductionTask) => void;
  onEdit: (t: ProductionTask) => void;
  onDelete: (t: ProductionTask) => void;
  onRepeat: (t: ProductionTask) => void;
  onView: (t: ProductionTask) => void;
  onAdd: () => void;
  showAdd: boolean;
  emptyLabel: string;
}

function FlowRow({
  label, icon, tasks, completions, canEdit, canComplete,
  onToggle, onEdit, onDelete, onRepeat, onView, onAdd, showAdd, emptyLabel,
}: FlowRowProps) {
  return (
    <div className="space-y-2">
      {/* Row header */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <Badge variant="secondary" className="text-[10px]">{tasks.length}</Badge>
      </div>

      {tasks.length === 0 && !showAdd ? (
        <p className="text-xs text-muted-foreground italic pl-1">{emptyLabel}</p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:flex items-start gap-1 overflow-x-auto pb-2">
            {tasks.map((t, i) => (
              <Fragment key={t.id}>
                <TaskNode
                  task={t} completions={completions}
                  canEdit={canEdit} canComplete={canComplete}
                  onToggle={() => onToggle(t)} onEdit={() => onEdit(t)}
                  onDelete={() => onDelete(t)} onRepeat={() => onRepeat(t)}
                  onView={() => onView(t)}
                />
                {i < tasks.length - 1 && (
                  <div className="self-center px-0.5 flex-shrink-0">
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-50" />
                  </div>
                )}
              </Fragment>
            ))}
            {showAdd && (
              <div className="self-start pl-1 flex-shrink-0">
                <button
                  onClick={onAdd}
                  className="flex items-center justify-center w-9 h-9 mt-3 rounded-full border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors"
                  title="Adicionar tarefa"
                >
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          {/* Mobile */}
          <div className="flex md:hidden flex-col gap-1">
            {tasks.map((t, i) => (
              <Fragment key={t.id}>
                <TaskNode
                  task={t} completions={completions}
                  canEdit={canEdit} canComplete={canComplete}
                  onToggle={() => onToggle(t)} onEdit={() => onEdit(t)}
                  onDelete={() => onDelete(t)} onRepeat={() => onRepeat(t)}
                  onView={() => onView(t)}
                />
                {i < tasks.length - 1 && (
                  <div className="flex justify-center">
                    <ArrowDown className="w-4 h-4 text-muted-foreground opacity-50" />
                  </div>
                )}
              </Fragment>
            ))}
            {showAdd && (
              <button
                onClick={onAdd}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-xs text-muted-foreground"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────

interface TaskFlowSectionProps {
  initialTasks: ProductionTask[];
  initialCompletions: ProductionTaskCompletion[];
  currentUserId: string;
  targetUserId: string;         // whose tasks are shown (self or other for admin)
  isAdmin: boolean;
  showAddButton?: boolean;       // false on read-only admin view
}

// ── Main Component ─────────────────────────────────────────

export function TaskFlowSection({
  initialTasks,
  initialCompletions,
  currentUserId,
  targetUserId,
  isAdmin,
  showAddButton = true,
}: TaskFlowSectionProps) {
  const [tasks, setTasks] = useState<ProductionTask[]>(initialTasks);
  const [completions, setCompletions] = useState<ProductionTaskCompletion[]>(initialCompletions);

  // can edit = task owner OR admin
  const canEdit = isAdmin || currentUserId === targetUserId;
  const canComplete = currentUserId === targetUserId;

  // ── Form state ───────────────────────────────────────────

  const [formOpen, setFormOpen]       = useState(false);
  const [editing, setEditing]         = useState<ProductionTask | null>(null);
  const [defaultFreq, setDefaultFreq] = useState<TaskFrequency>('daily');
  const [formTitle, setFormTitle]     = useState('');
  const [formDesc, setFormDesc]       = useState('');
  const [formFreq, setFormFreq]       = useState<TaskFrequency>('daily');
  const [formTime, setFormTime]       = useState('08:00');
  const [formDay, setFormDay]         = useState(1); // Mon
  const [formDate, setFormDate]       = useState(todayIso());
  const [saving, setSaving]           = useState(false);

  // Detail view
  const [viewTask, setViewTask] = useState<ProductionTask | null>(null);

  // Make recurring dialog
  const [recurringOpen, setRecurringOpen]   = useState(false);
  const [recurringTask, setRecurringTask]   = useState<ProductionTask | null>(null);
  const [recurringFreq, setRecurringFreq]   = useState<'daily' | 'weekly'>('daily');
  const [recurringDay, setRecurringDay]     = useState(1);

  // ── Derived task lists ───────────────────────────────────

  const now = new Date();
  const todayDay = now.getDay();
  const today = todayIso();

  const dailyTasks = tasks
    .filter((t) => t.frequency === 'daily')
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  // weekly: show ALL days ordered by (today first, then rest), then by time
  const weeklyTasks = tasks
    .filter((t) => t.frequency === 'weekly')
    .sort((a, b) => {
      const aDay = ((a.scheduled_day ?? 0) - todayDay + 7) % 7;
      const bDay = ((b.scheduled_day ?? 0) - todayDay + 7) % 7;
      if (aDay !== bDay) return aDay - bDay;
      return a.scheduled_time.localeCompare(b.scheduled_time);
    });

  const onceTasks = tasks
    .filter((t) => t.frequency === 'once')
    .sort((a, b) => {
      const da = a.scheduled_date ?? '';
      const db = b.scheduled_date ?? '';
      if (da !== db) return da.localeCompare(db);
      return a.scheduled_time.localeCompare(b.scheduled_time);
    });

  // ── Handlers ─────────────────────────────────────────────

  function openCreate(freq: TaskFrequency) {
    setEditing(null);
    setDefaultFreq(freq);
    setFormFreq(freq);
    setFormTitle('');
    setFormDesc('');
    setFormTime('08:00');
    setFormDay(1);
    setFormDate(todayIso());
    setFormOpen(true);
  }

  function openEdit(t: ProductionTask) {
    setEditing(t);
    setFormTitle(t.title);
    setFormDesc(t.description ?? '');
    setFormFreq(t.frequency);
    setFormTime(formatTime(t.scheduled_time));
    setFormDay(t.scheduled_day ?? 1);
    setFormDate(t.scheduled_date ?? todayIso());
    setFormOpen(true);
  }

  async function handleSave() {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await updateTaskAction(editing.id, {
          title: formTitle,
          description: formDesc,
          frequency: formFreq,
          scheduled_time: formTime,
          scheduled_day: formFreq === 'weekly' ? formDay : undefined,
          scheduled_date: formFreq === 'once' ? formDate : undefined,
        });
        if (res.error) { toast.error(res.error); return; }
        setTasks((prev) => prev.map((t) => t.id === editing.id ? res.task! : t));
        toast.success('Tarefa atualizada');
      } else {
        const res = await createTaskAction({
          title: formTitle,
          description: formDesc,
          assigned_to: targetUserId,
          frequency: formFreq,
          scheduled_time: formTime,
          scheduled_day: formFreq === 'weekly' ? formDay : undefined,
          scheduled_date: formFreq === 'once' ? formDate : undefined,
        });
        if (res.error) { toast.error(res.error); return; }
        setTasks((prev) => [...prev, res.task!]);
        toast.success('Tarefa criada');
      }
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(t: ProductionTask) {
    const isDone = t.frequency === 'weekly'
      ? isCompletedThisWeek(t.id, completions)
      : isCompletedToday(t.id, completions);

    if (isDone) {
      const res = await uncompleteTaskAction(t.id);
      if (res.error) { toast.error(res.error); return; }
      setCompletions((prev) => prev.filter((c) => !(c.task_id === t.id && c.completion_date === today)));
      toast('Conclusão desfeita');
    } else {
      const res = await completeTaskAction(t.id);
      if (res.error) { toast.error(res.error); return; }
      setCompletions((prev) => [...prev, res.completion!]);
      toast.success('Tarefa concluída!');
    }
  }

  async function handleDelete(t: ProductionTask) {
    if (!confirm(`Excluir "${t.title}"?`)) return;
    const res = await deleteTaskAction(t.id);
    if (res.error) { toast.error(res.error); return; }
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    toast.success('Tarefa removida');
  }

  function openRepeat(t: ProductionTask) {
    setRecurringTask(t);
    setRecurringFreq('daily');
    setRecurringDay(t.scheduled_day ?? new Date().getDay());
    setRecurringOpen(true);
  }

  async function handleMakeRecurring() {
    if (!recurringTask) return;
    const res = await makeRecurringAction(recurringTask.id, recurringFreq, recurringFreq === 'weekly' ? recurringDay : undefined);
    if (res.error) { toast.error(res.error); return; }
    setTasks((prev) => prev.map((t) => t.id === recurringTask.id ? res.task! : t));
    setRecurringOpen(false);
    toast.success(`Tarefa agora é ${recurringFreq === 'daily' ? 'diária' : 'semanal'}`);
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          Tarefas
        </h2>
        {showAddButton && canEdit && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openCreate('daily')}>
              <Plus className="w-3 h-3" /> Diária
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openCreate('weekly')}>
              <Plus className="w-3 h-3" /> Semanal
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openCreate('once')}>
              <Plus className="w-3 h-3" /> Única
            </Button>
          </div>
        )}
      </div>

      {/* Row 1: Diárias */}
      <FlowRow
        label="Diárias"
        icon={<Repeat2 className="w-3.5 h-3.5" />}
        tasks={dailyTasks}
        completions={completions}
        canEdit={canEdit}
        canComplete={canComplete}
        onToggle={handleToggle}
        onEdit={openEdit}
        onDelete={handleDelete}
        onRepeat={openRepeat}
        onView={setViewTask}
        onAdd={() => openCreate('daily')}
        showAdd={showAddButton && canEdit}
        emptyLabel="Nenhuma tarefa diária"
      />

      {/* Row 2: Semanais */}
      <FlowRow
        label="Semanais"
        icon={<CalendarDays className="w-3.5 h-3.5" />}
        tasks={weeklyTasks}
        completions={completions}
        canEdit={canEdit}
        canComplete={canComplete}
        onToggle={handleToggle}
        onEdit={openEdit}
        onDelete={handleDelete}
        onRepeat={openRepeat}
        onView={setViewTask}
        onAdd={() => openCreate('weekly')}
        showAdd={showAddButton && canEdit}
        emptyLabel="Nenhuma tarefa semanal"
      />

      {/* Row 3: Únicas */}
      <FlowRow
        label="Únicas / Pontuais"
        icon={<Clock className="w-3.5 h-3.5" />}
        tasks={onceTasks}
        completions={completions}
        canEdit={canEdit}
        canComplete={canComplete}
        onToggle={handleToggle}
        onEdit={openEdit}
        onDelete={handleDelete}
        onRepeat={openRepeat}
        onView={setViewTask}
        onAdd={() => openCreate('once')}
        showAdd={showAddButton && canEdit}
        emptyLabel="Nenhuma tarefa pontual"
      />

      {/* ─── Modal: Detalhe da Tarefa ─── */}
      <Dialog open={!!viewTask} onOpenChange={(o) => !o && setViewTask(null)}>
        <DialogContent className="max-w-md">
          {viewTask && (() => {
            const done = viewTask.frequency === 'weekly'
              ? isCompletedThisWeek(viewTask.id, completions)
              : isCompletedToday(viewTask.id, completions);
            const overdue = !done && isOverdue(viewTask, completions);
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <DialogTitle className="text-lg leading-snug">{viewTask.title}</DialogTitle>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {done && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 text-[10px] gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Concluída
                          </Badge>
                        )}
                        {overdue && (
                          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300 text-[10px] gap-1">
                            <AlertCircle className="w-3 h-3" /> Atrasada
                          </Badge>
                        )}
                        {!done && !overdue && (
                          <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {viewTask.frequency === 'daily' ? 'Diária' : viewTask.frequency === 'weekly' ? 'Semanal' : 'Única'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4 pt-1">
                  {/* Horário / Data */}
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <span className="font-medium">{formatTime(viewTask.scheduled_time)}</span>
                      {viewTask.frequency === 'weekly' && viewTask.scheduled_day !== null && (
                        <span className="text-muted-foreground ml-2">— {DAY_FULL[viewTask.scheduled_day]}</span>
                      )}
                      {viewTask.frequency === 'once' && viewTask.scheduled_date && (
                        <span className="text-muted-foreground ml-2">
                          — {new Date(viewTask.scheduled_date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </span>
                      )}
                      {viewTask.frequency === 'daily' && (
                        <span className="text-muted-foreground ml-2">— todos os dias</span>
                      )}
                    </div>
                  </div>

                  {/* Descrição */}
                  {viewTask.description && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{viewTask.description}</p>
                    </div>
                  )}

                  {/* Ações */}
                  {(canEdit || canComplete) && (
                    <div className="flex gap-2 pt-1">
                      {canComplete && (
                        <Button
                          size="sm"
                          variant={done ? 'outline' : 'default'}
                          className="flex-1 gap-1.5"
                          onClick={() => { handleToggle(viewTask); setViewTask(null); }}
                        >
                          <Check className="w-3.5 h-3.5" />
                          {done ? 'Desfazer conclusão' : 'Marcar concluída'}
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => { setViewTask(null); openEdit(viewTask); }}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Criar / Editar Tarefa ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Título *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: Abrir caixa, Relatório semanal..."
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Detalhes da tarefa..."
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Frequência */}
            <div className="space-y-1">
              <Label>Frequência</Label>
              <div className="flex gap-1.5">
                {(['daily', 'weekly', 'once'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormFreq(f)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      formFreq === f
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    {f === 'daily' ? 'Diária' : f === 'weekly' ? 'Semanal' : 'Única'}
                  </button>
                ))}
              </div>
            </div>

            {/* Horário */}
            <div className="space-y-1">
              <Label>Horário</Label>
              <Input
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
              />
            </div>

            {/* Dia da semana */}
            {formFreq === 'weekly' && (
              <div className="space-y-1">
                <Label>Dia da semana</Label>
                <div className="flex gap-1 flex-wrap">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => setFormDay(i)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        formDay === i
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Data específica */}
            {formFreq === 'once' && (
              <div className="space-y-1">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
            )}

            <Button onClick={handleSave} disabled={saving || !formTitle.trim()} className="w-full">
              {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar tarefa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Tornar Recorrente ─── */}
      <Dialog open={recurringOpen} onOpenChange={setRecurringOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Tornar recorrente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escolha como <strong>{recurringTask?.title}</strong> vai se repetir:
            </p>
            <div className="flex gap-2">
              {(['daily', 'weekly'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRecurringFreq(f)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    recurringFreq === f
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  {f === 'daily' ? '🔁 Diária' : '📅 Semanal'}
                </button>
              ))}
            </div>
            {recurringFreq === 'weekly' && (
              <div className="space-y-1">
                <Label>Dia da semana</Label>
                <div className="flex gap-1 flex-wrap">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => setRecurringDay(i)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        recurringDay === i
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={handleMakeRecurring} className="w-full">
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
