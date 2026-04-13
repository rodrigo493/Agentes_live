'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, AlertTriangle, AlertOctagon, Clock, X, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getFlowsViewAction,
  getInstancesAtStepAction,
  type FlowView,
  type FlowStepView,
  type FlowInstanceAtStep,
} from '../actions/flow-view-actions';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function WorkflowFlowsView() {
  const [flows, setFlows] = useState<FlowView[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<{ flow: FlowView; step: FlowStepView } | null>(null);
  const [stepInstances, setStepInstances] = useState<FlowInstanceAtStep[] | null>(null);

  async function load() {
    const r = await getFlowsViewAction();
    if (r.flows) setFlows(r.flows);
    setIsAdmin(r.isAdmin);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function openStep(flow: FlowView, step: FlowStepView) {
    setSelectedStep({ flow, step });
    setStepInstances(null);
    const r = await getInstancesAtStepAction(step.template_step_id);
    setStepInstances(r.instances ?? []);
  }

  if (loading) return <div className="text-sm text-muted-foreground py-6 text-center">Carregando fluxos…</div>;

  if (flows.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        {isAdmin
          ? 'Nenhum fluxo de trabalho cadastrado. Crie em "Fluxos → Novo Fluxo".'
          : 'Você ainda não participa de nenhum fluxo.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {flows.map((flow) => (
        <div key={flow.template_id} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-sm">{flow.template_name}</h3>
              {flow.description && (
                <p className="text-xs text-muted-foreground">{flow.description}</p>
              )}
            </div>
            {!isAdmin && flow.user_step_orders.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                Você participa das etapas: {flow.user_step_orders.join(', ')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
            {flow.steps.map((step, i) => {
              const isMine = !isAdmin && flow.user_step_orders.includes(step.step_order);
              const isNext = !isAdmin && flow.user_step_orders.some((o) => o === step.step_order - 1);
              const dim = !isAdmin && !isMine && !isNext;

              return (
                <div key={step.template_step_id} className="flex items-center gap-2">
                  <button
                    onClick={() => openStep(flow, step)}
                    className={`relative text-left px-3 py-2 rounded-lg border-2 transition-all min-w-[140px] ${
                      step.overdue_count > 0
                        ? 'border-red-500 bg-red-100 dark:bg-red-500/15'
                        : 'border-green-300 bg-green-100 dark:bg-green-500/15'
                    } ${dim ? 'opacity-40' : ''} ${isMine ? 'ring-2 ring-primary' : ''} hover:opacity-90`}
                  >
                    {(isMine || isNext) && (
                      <div className="flex items-center gap-1 text-[10px] font-bold">
                        {isMine && <span className="text-primary">VOCÊ</span>}
                        {isNext && <span className="text-blue-600">PRÓXIMO</span>}
                      </div>
                    )}
                    <div className="text-xs font-semibold leading-tight">{step.title}</div>
                    {step.assignee_label && (
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Users className="w-2.5 h-2.5" /> {step.assignee_label}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border/40">
                      <span className="text-[10px] flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> {step.sla_hours}h
                      </span>
                      {step.running_count > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          {step.running_count} em andamento
                        </span>
                      )}
                    </div>
                    {step.overdue_count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> {step.overdue_count}
                      </span>
                    )}
                    {step.blocked_count > 0 && step.overdue_count === 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <AlertOctagon className="w-2.5 h-2.5" /> {step.blocked_count}
                      </span>
                    )}
                  </button>
                  {i < flow.steps.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          {isAdmin && (
            <p className="text-[10px] text-muted-foreground">
              💡 Clique numa etapa para ver todas as instâncias rodando nela.
            </p>
          )}
        </div>
      ))}

      <Dialog open={!!selectedStep} onOpenChange={(o) => !o && setSelectedStep(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedStep ? `${selectedStep.flow.template_name} · ${selectedStep.step.title}` : ''}
            </DialogTitle>
          </DialogHeader>
          {stepInstances === null ? (
            <div className="text-center py-6 text-sm text-muted-foreground">Carregando…</div>
          ) : stepInstances.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              Nenhuma instância ativa nesta etapa.
            </div>
          ) : (
            <div className="space-y-2">
              {stepInstances.map((inst) => (
                <div
                  key={inst.instance_id}
                  className={`border rounded-lg p-3 flex items-start justify-between gap-3 ${
                    inst.is_overdue ? 'border-destructive/40 bg-destructive/5' :
                    inst.step_status === 'blocked' ? 'border-amber-400/40 bg-amber-400/5' : ''
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {inst.reference}
                      {inst.is_overdue && (
                        <span className="text-[10px] bg-destructive text-destructive-foreground px-1.5 rounded">
                          ATRASADO
                        </span>
                      )}
                      {inst.step_status === 'blocked' && (
                        <span className="text-[10px] bg-amber-500 text-white px-1.5 rounded">BLOQUEADO</span>
                      )}
                    </div>
                    {inst.title && <p className="text-xs text-muted-foreground">{inst.title}</p>}
                    <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-3">
                      <span>Iniciado: {fmtDate(inst.started_at)}</span>
                      {inst.due_at && <span>Prazo: {fmtDate(inst.due_at)}</span>}
                      {inst.assignee_name && <span>Responsável: {inst.assignee_name}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CloseIcon() { return <X className="w-4 h-4" />; }
