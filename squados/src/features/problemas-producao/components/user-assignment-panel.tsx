'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    existingAssignments.map((a) => a.assigned_user_id)
  );
  const [solution, setSolution] = useState(existingAssignments[0]?.solution ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSquadUsers().then(({ users, error }) => {
      if (error) setError(error);
      setAllUsers(users ?? []);
      setLoading(false);
    });
  }, []);

  const filtered = allUsers.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    if (!selectedIds.length) { setError('Selecione ao menos um usuário'); return; }
    setSaving(true);
    setError(null);
    const result = await assignProblem(problemId, selectedIds, solution);
    setSaving(false);
    if (result.error) setError(result.error);
    else onSaved();
  }

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-4 mt-3 space-y-4">

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Encaminhar para
      </p>

      {/* Filtro */}
      <Input
        placeholder="Filtrar por nome..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-sm h-8"
      />

      {/* Lista de usuários */}
      <div className="border border-border rounded-md overflow-hidden max-h-56 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando usuários…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {allUsers.length === 0 ? 'Nenhum usuário encontrado' : 'Nenhum resultado para o filtro'}
          </div>
        ) : (
          filtered.map((u) => {
            const selected = selectedIds.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm text-left border-b border-border last:border-0 transition-colors ${
                  selected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/60'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  selected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}>
                  {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className="flex-1 font-medium">{u.full_name}</span>
                {u.sector_name && (
                  <span className="text-xs text-muted-foreground shrink-0">{u.sector_name}</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {selectedIds.length > 0 && (
        <p className="text-xs text-primary">
          {selectedIds.length} usuário{selectedIds.length > 1 ? 's' : ''} selecionado{selectedIds.length > 1 ? 's' : ''}
        </p>
      )}

      {/* Solução */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Solução / Instrução
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
        <Button size="sm" onClick={handleSave} disabled={saving || loading}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Confirmar encaminhamento
        </Button>
      </div>
    </div>
  );
}
