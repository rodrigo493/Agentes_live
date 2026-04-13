'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { deleteCatalogProcessAction } from '../actions/catalog-actions';
import { ProcessDetailModal } from './process-detail-modal';
import { ProcessFormModal } from './process-form-modal';
import type { ProcessCatalogFull, Sector } from '@/shared/types/database';

const COLOR_MAP: Record<string, { border: string; bg: string; text: string }> = {
  violet: { border: 'border-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300' },
  blue:   { border: 'border-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-700 dark:text-blue-300' },
  emerald:{ border: 'border-emerald-500',bg: 'bg-emerald-500/10',text: 'text-emerald-700 dark:text-emerald-300' },
  amber:  { border: 'border-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-700 dark:text-amber-300' },
  rose:   { border: 'border-rose-500',   bg: 'bg-rose-500/10',   text: 'text-rose-700 dark:text-rose-300' },
  slate:  { border: 'border-slate-500',  bg: 'bg-slate-500/10',  text: 'text-slate-700 dark:text-slate-300' },
};

interface ProcessCatalogShellProps {
  initialProcesses: ProcessCatalogFull[];
  sectors: Sector[];
  isAdmin: boolean;
}

export function ProcessCatalogShell({ initialProcesses, sectors, isAdmin }: ProcessCatalogShellProps) {
  const [processes, setProcesses] = useState(initialProcesses);
  const [view, setView] = useState<'grupos' | 'processos'>('grupos');
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set(['__none__']));
  const [detailProcess, setDetailProcess] = useState<ProcessCatalogFull | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<ProcessCatalogFull | null>(null);

  const sectors_with_processes = sectors
    .filter(s => processes.some(p => p.sector_id === s.id))
    .map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      processes: processes.filter(p => p.sector_id === s.id),
    }));

  const unsectored = processes.filter(p => !p.sector_id);

  function toggleSector(id: string) {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Excluir este processo do catálogo?')) return;
    const res = await deleteCatalogProcessAction(id);
    if (res.error) { toast.error(res.error); return; }
    setProcesses(prev => prev.filter(p => p.id !== id));
    toast.success('Processo excluído');
  }

  function ProcessButton({ p }: { p: ProcessCatalogFull }) {
    const c = COLOR_MAP[p.color] ?? COLOR_MAP.violet;
    return (
      <div className="relative group inline-flex">
        <button
          onClick={() => setDetailProcess(p)}
          className={`text-left px-3 py-1.5 rounded-lg border-2 ${c.border} ${c.bg} hover:opacity-90 transition-opacity whitespace-nowrap`}
        >
          <span className={`text-sm font-semibold ${c.text}`}>{p.title}</span>
        </button>
        {isAdmin && (
          <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setEditingProcess(p); setFormOpen(true); }}
              className="p-1 rounded bg-background border border-border shadow-sm hover:bg-muted"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleDelete(p.id, e)}
              className="p-1 rounded bg-background border border-border shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  function SectorAccordion({ id, name, icon, items }: { id: string; name: string; icon: string | null; items: ProcessCatalogFull[] }) {
    const expanded = expandedSectors.has(id);
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSector(id)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            {icon && <span>{icon}</span>}
            <span className="font-semibold text-sm">{name}</span>
            <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expanded && (
          <div className="p-3 flex flex-wrap gap-2">
            {items.map(p => <ProcessButton key={p.id} p={p} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Processos da Fábrica</h1>
        {isAdmin && (
          <Button onClick={() => { setEditingProcess(null); setFormOpen(true); }} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> Novo Processo
          </Button>
        )}
      </div>

      {sectors_with_processes.length === 0 && unsectored.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">Nenhum processo cadastrado</p>
          {isAdmin && <p className="text-sm mt-1">Clique em &quot;+ Novo Processo&quot; para começar</p>}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={view === 'grupos' ? 'default' : 'outline'}
          onClick={() => setView('grupos')}
        >
          Grupos
        </Button>
        <Button
          size="sm"
          variant={view === 'processos' ? 'default' : 'outline'}
          onClick={() => setView('processos')}
        >
          Processos
        </Button>
      </div>

      {view === 'grupos' ? (
        <div className="space-y-3">
          {sectors_with_processes.map(s => (
            <SectorAccordion key={s.id} id={s.id} name={s.name} icon={s.icon} items={s.processes} />
          ))}
          {unsectored.length > 0 && (
            <SectorAccordion id="__none__" name="Sem setor" icon={null} items={unsectored} />
          )}
        </div>
      ) : (
        <div className="border border-border rounded-lg p-3 flex flex-wrap gap-2">
          {processes.map(p => <ProcessButton key={p.id} p={p} />)}
        </div>
      )}

      <ProcessDetailModal
        process={detailProcess}
        open={!!detailProcess}
        onClose={() => setDetailProcess(null)}
      />

      <ProcessFormModal
        open={formOpen}
        process={editingProcess}
        sectors={sectors}
        onClose={() => { setFormOpen(false); setEditingProcess(null); }}
        onSaved={(saved) => {
          setProcesses(prev => {
            const idx = prev.findIndex(p => p.id === saved.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = saved;
              return next;
            }
            return [...prev, saved];
          });
        }}
      />
    </div>
  );
}
