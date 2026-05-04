'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAssignmentPanel } from './user-assignment-panel';
import type { ProductionProblem } from '../actions/problemas-actions';

interface ProblemKpiCardProps {
  problem: ProductionProblem;
  isAdmin: boolean;
  onAssigned: () => void;
}

function StatusBadge({ problem }: { problem: ProductionProblem }) {
  if (problem.assignments.length > 0) {
    return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">ENCAMINHADO</Badge>;
  }
  return <Badge className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]">NOVO</Badge>;
}

function borderColor(problem: ProductionProblem) {
  if (problem.assignments.length > 0) return 'border-l-emerald-500';
  return 'border-l-red-500';
}

export function ProblemKpiCard({ problem, isAdmin, onAssigned }: ProblemKpiCardProps) {
  const [expanded, setExpanded] = useState(false);

  const formattedDate = new Date(problem.received_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`bg-card border border-l-4 ${borderColor(problem)} rounded-lg p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge problem={problem} />
            <span className="text-xs text-muted-foreground">
              Cliente: <span className="text-foreground font-medium">{problem.client_name}</span>
            </span>
            <span className="text-xs text-muted-foreground">· {formattedDate}</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{problem.description}</p>

          {problem.assignments.length > 0 && !expanded && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span>Encaminhado para:</span>
              {problem.assignments.map((a) => (
                <span key={a.id} className="text-primary">{a.assigned_user_name}</span>
              ))}
              {problem.assignments[0]?.solution && (
                <>
                  <span>·</span>
                  <span className="text-amber-500 italic truncate max-w-[200px]">
                    &quot;{problem.assignments[0].solution}&quot;
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-xs"
          >
            {expanded ? (
              <><ChevronUp className="w-3 h-3 mr-1" /> Fechar</>
            ) : problem.assignments.length > 0 ? (
              <><ChevronDown className="w-3 h-3 mr-1" /> Editar</>
            ) : (
              <><ChevronDown className="w-3 h-3 mr-1" /> Encaminhar</>
            )}
          </Button>
        )}
      </div>

      {isAdmin && expanded && (
        <UserAssignmentPanel
          problemId={problem.id}
          existingAssignments={problem.assignments}
          onClose={() => setExpanded(false)}
          onSaved={() => { setExpanded(false); onAssigned(); }}
        />
      )}

      {!isAdmin && problem.assignments[0]?.solution && (
        <div className="mt-3 bg-amber-500/10 border-l-2 border-amber-500 rounded-r px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <span className="font-medium">Solução do Problema: </span>
          {problem.assignments[0].solution}
        </div>
      )}
    </div>
  );
}
