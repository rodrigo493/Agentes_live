'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { ProcessCatalogFull } from '@/shared/types/database';

interface ProcessPickerModalProps {
  open: boolean;
  onClose: () => void;
  catalogProcesses: ProcessCatalogFull[];
  alreadyAssignedIds: string[];
  onConfirm: (selectedIds: string[]) => Promise<void>;
}

export function ProcessPickerModal({
  open, onClose, catalogProcesses, alreadyAssignedIds, onConfirm,
}: ProcessPickerModalProps) {
  const [tab, setTab] = useState<'groups' | 'all'>('groups');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const available = catalogProcesses.filter(p => !alreadyAssignedIds.includes(p.id));

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    return available.filter(p =>
      p.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [available, search]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; icon: string | null; processes: ProcessCatalogFull[] }>();
    for (const p of available) {
      const key = p.sector_id ?? '__none__';
      if (!map.has(key)) {
        map.set(key, { name: p.sector_name ?? 'Sem setor', icon: null, processes: [] });
      }
      map.get(key)!.processes.push(p);
    }
    return map;
  }, [available]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroup(sectorKey: string) {
    const group = groups.get(sectorKey);
    if (!group) return;
    const allSelected = group.processes.every(p => selected.has(p.id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        group.processes.forEach(p => next.delete(p.id));
      } else {
        group.processes.forEach(p => next.add(p.id));
      }
      return next;
    });
  }

  function toggleExpand(key: string) {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await onConfirm([...selected]);
      setSelected(new Set());
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Processo ao fluxo</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border -mx-6 px-6">
          <button
            onClick={() => setTab('groups')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'groups' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Grupos
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'all' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos (A–Z)
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar processo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 h-9 rounded-md border border-input bg-muted px-3 text-sm"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {tab === 'groups' ? (
            [...groups.entries()].map(([key, group]) => {
              const expanded = expandedSectors.has(key);
              const allGroupSelected = group.processes.every(p => selected.has(p.id));
              const someSelected = group.processes.some(p => selected.has(p.id));
              const visibleProcesses = search.trim()
                ? group.processes.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
                : group.processes;
              if (visibleProcesses.length === 0) return null;

              return (
                <div key={key} className="border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2.5 bg-muted/40">
                    <button
                      onClick={() => toggleExpand(key)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-semibold text-sm">{group.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{visibleProcesses.length}</Badge>
                    </button>
                    <button
                      onClick={() => toggleGroup(key)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        allGroupSelected
                          ? 'bg-primary text-primary-foreground border-transparent'
                          : someSelected
                            ? 'bg-primary/20 border-primary/40 text-primary'
                            : 'border-input hover:bg-muted'
                      }`}
                    >
                      {allGroupSelected ? '✓ Grupo' : '+ Grupo inteiro'}
                    </button>
                  </div>
                  {expanded && (
                    <div className="p-2 space-y-1">
                      {visibleProcesses.map(p => (
                        <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggle(p.id)}
                            className="rounded"
                          />
                          <span className="flex-1">{p.title}</span>
                          {p.media.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">{p.media.length} mídia{p.media.length > 1 ? 's' : ''}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="space-y-1">
              {filtered.length === 0 && (
                <p className="text-center py-8 text-sm text-muted-foreground">Nenhum processo encontrado</p>
              )}
              {filtered.sort((a, b) => a.title.localeCompare(b.title)).map(p => (
                <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded hover:bg-muted cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="rounded"
                  />
                  <span className="flex-1">{p.title}</span>
                  {p.sector_name && <span className="text-[10px] text-muted-foreground">{p.sector_name}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 pt-2 border-t border-border mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0 || loading}
            className="flex-1"
          >
            {loading ? 'Adicionando...' : `Adicionar (${selected.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
