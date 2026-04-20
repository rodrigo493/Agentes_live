'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Play, AlertTriangle, ArrowRight, Clock, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { TemplateEditorModal } from './template-editor-modal';
import { StartInstanceModal } from './start-instance-modal';
import { OverdueDashboard } from './overdue-dashboard';
import { BlockAnalytics } from './block-analytics';
import { OverdueTimelineChart } from './overdue-timeline-chart';
import { AdminKanbanView } from './workflow-admin-kanban';
import type { WorkflowTemplateFull, Sector, Profile, WorkflowInstance } from '@/shared/types/database';

type View = 'templates' | 'kanban' | 'instances' | 'overdue' | 'analytics';

interface Props {
  initialTemplates: WorkflowTemplateFull[];
  initialInstances: (WorkflowInstance & { template_name: string })[];
  sectors: Sector[];
  users: Pick<Profile, 'id' | 'full_name' | 'sector_id'>[];
  isAdmin: boolean;
  isMaster: boolean;
}

export function WorkflowShell({
  initialTemplates, initialInstances, sectors, users, isAdmin, isMaster,
}: Props) {
  const [view, setView] = useState<View>('kanban');
  const [templates, setTemplates] = useState(initialTemplates);
  const [instances] = useState(initialInstances);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplateFull | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [startTemplate, setStartTemplate] = useState<WorkflowTemplateFull | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Fluxos de Trabalho</h2>
        <div className="flex gap-2">
          <Button size="sm" variant={view === 'templates' ? 'default' : 'outline'} onClick={() => setView('templates')}>
            Fluxos
          </Button>
          {isAdmin && (
            <Button size="sm" variant={view === 'kanban' ? 'default' : 'outline'} onClick={() => setView('kanban')}>
              Kanban
            </Button>
          )}
          <Button size="sm" variant={view === 'instances' ? 'default' : 'outline'} onClick={() => setView('instances')}>
            Meus em andamento
          </Button>
          {isAdmin && (
            <>
              <Button size="sm" variant={view === 'overdue' ? 'default' : 'outline'} onClick={() => setView('overdue')}>
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Atrasos
              </Button>
              <Button size="sm" variant={view === 'analytics' ? 'default' : 'outline'} onClick={() => setView('analytics')}>
                <BarChart3 className="w-3.5 h-3.5 mr-1" /> Analytics
              </Button>
            </>
          )}
        </div>
      </div>

      {view === 'templates' && (
        <div className="space-y-3">
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => { setEditingTemplate(null); setEditorOpen(true); }}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" /> Novo Fluxo
            </Button>
          )}
          {templates.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum fluxo cadastrado ainda.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((t) => (
                <div key={t.id} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-sm">{t.name}</h3>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setStartTemplate(t); setStartOpen(true); }}>
                        <Play className="w-3.5 h-3.5 mr-1" /> Iniciar
                      </Button>
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => { setEditingTemplate(t); setEditorOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {t.steps.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t">
                      {t.steps.map((s, i) => {
                        const assigneeUser = users.find(u => u.id === s.assignee_user_id);
                        const assigneeSector = sectors.find(x => x.id === s.assignee_sector_id);
                        const label = assigneeUser?.full_name ?? assigneeSector?.name ?? '?';
                        return (
                          <div key={s.id} className="flex items-center gap-1.5">
                            <div className="px-2 py-1 rounded border text-[10px] bg-muted/40">
                              <div className="font-semibold">{s.title}</div>
                              <div className="text-muted-foreground">
                                {label} · {s.sla_hours}h
                              </div>
                            </div>
                            {i < t.steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {t.steps.length === 0 && isAdmin && (
                    <p className="text-[11px] text-amber-600">⚠ Nenhuma etapa — edite para adicionar.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'kanban' && isAdmin && (
        <AdminKanbanView templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
      )}

      {view === 'instances' && (
        <div className="space-y-2">
          {instances.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Você ainda não iniciou nenhum fluxo.
            </div>
          ) : (
            instances.map((i) => (
              <div key={i.id} className="border rounded-lg px-4 py-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{i.reference}</div>
                  <div className="text-xs text-muted-foreground">{i.template_name}{i.title ? ` · ${i.title}` : ''}</div>
                </div>
                <Badge variant={i.status === 'running' ? 'default' : 'secondary'}>
                  {i.status === 'running' ? 'Em andamento' : i.status === 'completed' ? 'Concluído' : 'Cancelado'}
                </Badge>
              </div>
            ))
          )}
        </div>
      )}

      {view === 'overdue' && isAdmin && (
        <OverdueDashboard isMaster={isMaster} />
      )}

      {view === 'analytics' && isAdmin && (
        <div className="space-y-6">
          <OverdueTimelineChart />
          <BlockAnalytics />
        </div>
      )}

      {editorOpen && (
        <TemplateEditorModal
          template={editingTemplate}
          sectors={sectors}
          users={users}
          open={editorOpen}
          onClose={() => { setEditorOpen(false); setEditingTemplate(null); }}
          onSaved={(t) => {
            setTemplates(prev => {
              const idx = prev.findIndex(x => x.id === t.id);
              if (idx >= 0) { const next = [...prev]; next[idx] = t; return next; }
              return [...prev, t];
            });
          }}
        />
      )}

      {startOpen && startTemplate && (
        <StartInstanceModal
          template={startTemplate}
          open={startOpen}
          onClose={() => { setStartOpen(false); setStartTemplate(null); }}
          onStarted={() => {
            toast.success('Fluxo iniciado — primeira etapa notificada ao responsável');
            setView('kanban');
          }}
        />
      )}
    </div>
  );
}

export function Placeholder() { return <Clock className="w-4 h-4" />; }
