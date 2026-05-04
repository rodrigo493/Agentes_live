'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { assignProblem, getSquadUsers } from '../actions/problemas-actions';
import type { SquadUser, ProblemAssignment } from '../actions/problemas-actions';

interface UserAssignmentPanelProps {
  problemId: string;
  existingAssignments: ProblemAssignment[];
  onClose: () => void;
  onSaved: () => void;
}

export function UserAssignmentPanel({
  problemId,
  existingAssignments,
  onClose,
  onSaved,
}: UserAssignmentPanelProps) {
  const [allUsers, setAllUsers] = useState<SquadUser[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    existingAssignments.map((a) => a.assigned_user_id)
  );
  const [solution, setSolution] = useState(existingAssignments[0]?.solution ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSquadUsers().then(({ users }) => setAllUsers(users ?? []));
  }, []);

  const filtered = allUsers.filter(
    (u) =>
      !selectedIds.includes(u.id) &&
      u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUsers = allUsers.filter((u) => selectedIds.includes(u.id));

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    if (!selectedIds.length) {
      setError('Selecione ao menos um usuário');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await assignProblem(problemId, selectedIds, solution);
    setSaving(false);
    if (result.error) {
      setError(result.error);
    } else {
      onSaved();
    }
  }

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4 mt-3 space-y-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          Encaminhar para
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-xs"
            >
              {u.full_name}
              {u.sector_name && (
                <span className="text-muted-foreground">({u.sector_name})</span>
              )}
              <button onClick={() => toggle(u.id)} className="text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selectedIds.length === 0 && (
            <span className="text-xs text-muted-foreground italic">Nenhum usuário selecionado</span>
          )}
        </div>

        <div className="relative">
          <Input
            placeholder="Buscar usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm h-8"
          />
          {search && filtered.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
              {filtered.slice(0, 8).map((u) => (
                <button
                  key={u.id}
                  onClick={() => { toggle(u.id); setSearch(''); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <Plus className="w-3 h-3 text-muted-foreground" />
                  <span>{u.full_name}</span>
                  {u.sector_name && (
                    <span className="text-muted-foreground text-xs ml-auto">{u.sector_name}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          Solução do Problema
        </p>
        <Textarea
          placeholder="Descreva a solução ou instrução para os responsáveis..."
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Confirmar encaminhamento
        </Button>
      </div>
    </div>
  );
}
