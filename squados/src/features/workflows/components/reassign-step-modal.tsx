'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { UserCheck, Clock } from 'lucide-react';
import { reassignStepAction, listStepReassignmentsAction } from '../actions/reassign-actions';
import type { Profile } from '@/shared/types/database';

interface Props {
  stepId: string;
  stepTitle: string;
  currentAssigneeId: string | null;
  users: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  open: boolean;
  onClose: () => void;
  onReassigned: (newUserId: string) => void;
}

type ReassignmentHistory = {
  id: string;
  from_user_name: string | null;
  to_user_name: string;
  reassigned_by_name: string;
  reassigned_at: string;
};

export function ReassignStepModal({
  stepId, stepTitle, currentAssigneeId, users, open, onClose, onReassigned,
}: Props) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ReassignmentHistory[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  async function loadHistory() {
    if (historyLoaded) return;
    const r = await listStepReassignmentsAction(stepId);
    if (r.reassignments) setHistory(r.reassignments as ReassignmentHistory[]);
    setHistoryLoaded(true);
  }

  async function handleReassign() {
    if (!selectedUserId) return;
    setSaving(true);
    const r = await reassignStepAction(stepId, selectedUserId);
    setSaving(false);
    if (r.error) return toast.error(r.error);
    toast.success('Etapa reatribuída com sucesso');
    setHistoryLoaded(false);
    loadHistory();
    onReassigned(selectedUserId);
    onClose();
  }

  const otherUsers = users.filter((u) => u.id !== currentAssigneeId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else loadHistory(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" /> Reatribuir etapa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Etapa: <span className="font-medium text-foreground">{stepTitle}</span>
          </p>

          <div>
            <Label>Novo responsável</Label>
            <select
              className="w-full h-9 text-sm rounded-md border border-input bg-background px-2 mt-1"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">— selecione —</option>
              {otherUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleReassign} disabled={!selectedUserId || saving}>
              {saving ? 'Salvando…' : 'Confirmar reatribuição'}
            </Button>
          </div>

          {history.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico</p>
              {history.map((h) => (
                <div key={h.id} className="text-xs text-muted-foreground flex items-start gap-2">
                  <Clock className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    <span className="text-foreground font-medium">{h.reassigned_by_name}</span> reatribuiu de{' '}
                    <Badge variant="outline" className="text-[10px]">{h.from_user_name ?? 'ninguém'}</Badge>{' '}
                    para <Badge variant="outline" className="text-[10px]">{h.to_user_name}</Badge>{' '}
                    em {new Date(h.reassigned_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
