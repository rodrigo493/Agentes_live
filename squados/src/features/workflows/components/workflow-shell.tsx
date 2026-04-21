'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BarChart3, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { TemplateEditorModal } from './template-editor-modal';
import { StartInstanceModal } from './start-instance-modal';
import { OverdueDashboard } from './overdue-dashboard';
import { BlockAnalytics } from './block-analytics';
import { OverdueTimelineChart } from './overdue-timeline-chart';
import { AdminKanbanView } from './workflow-admin-kanban';
import type { WorkflowTemplateFull, Sector, Profile, WorkflowInstance } from '@/shared/types/database';

type SecondaryView = 'main' | 'instances' | 'overdue' | 'analytics';

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
  const [view, setView] = useState<SecondaryView>('main');
  const [templates, setTemplates] = useState(initialTemplates);
  const [instances] = useState(initialInstances);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplateFull | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [startTemplate, setStartTemplate] = useState<WorkflowTemplateFull | null>(null);

  function openEditor(templateId?: string) {
    const t = templateId ? templates.find(x => x.id === templateId) ?? null : null;
    setEditingTemplate(t);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-3">
      {/* Barra de navegação secundária */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-foreground">Fluxos de Trabalho</h2>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={view === 'main' ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => setView('main')}
          >
            Operações
          </Button>
          <Button
            size="sm"
            variant={view === 'instances' ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => setView('instances')}
          >
            Meus em andamento
          </Button>
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant={view === 'overdue' ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => setView('overdue')}
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Atrasos
              </Button>
              <Button
                size="sm"
                variant={view === 'analytics' ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => setView('analytics')}
              >
                <BarChart3 className="w-3.5 h-3.5 mr-1" /> Analytics
              </Button>
            </>
          )}
        </div>
      </div>

      {/* View principal: pastas + kanban */}
      {view === 'main' && (
        <AdminKanbanView
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            steps: t.steps,
          }))}
          users={users}
          sectors={sectors}
          onNewFlow={() => openEditor()}
          onEditFlow={(id) => openEditor(id)}
          onStartFlow={(id) => {
            const t = templates.find(x => x.id === id);
            if (t) { setStartTemplate(t); setStartOpen(true); }
          }}
          onFlowDeleted={(id) => setTemplates((prev) => prev.filter((t) => t.id !== id))}
        />
      )}

      {/* Meus em andamento */}
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

      {view === 'overdue' && isAdmin && <OverdueDashboard isMaster={isMaster} />}

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
            setView('main');
          }}
        />
      )}
    </div>
  );
}

export function Placeholder() { return <Clock className="w-4 h-4" />; }
