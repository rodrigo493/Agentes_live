'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Loader2, ExternalLink, Plus, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { NovaMissaoModal } from './nova-missao-modal';

interface Workflow {
  id: string;
  conteudo: string;
  status: string;
  criado_em: string;
}

interface Missao {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  workflows: Workflow[];
}

interface Props {
  missoes: Missao[];
}

const STATUS_COLORS: Record<string, string> = {
  Planejamento: 'bg-yellow-100 text-yellow-800',
  'Em Execução': 'bg-blue-100 text-blue-800',
  Concluída: 'bg-green-100 text-green-800',
  Cancelada: 'bg-red-100 text-red-800',
  Backlog: 'bg-gray-100 text-gray-800',
};

const WORKFLOW_STATUS_COLORS: Record<string, string> = {
  Rascunho: 'bg-gray-100 text-gray-700',
  'Aguardando Aprovação': 'bg-orange-100 text-orange-800',
  Aprovado: 'bg-green-100 text-green-800',
  'Em Execução': 'bg-blue-100 text-blue-800',
  Concluído: 'bg-emerald-100 text-emerald-800',
};

export function MissoesShell({ missoes: initialMissoes }: Props) {
  const router = useRouter();
  const [missoes, setMissoes] = useState(initialMissoes);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Missao | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  async function handleDecisao(workflowId: string, missaoId: string, acao: 'aprovar' | 'rejeitar') {
    setLoading((l) => ({ ...l, [workflowId]: true }));
    try {
      const res = await fetch(`/api/workflows/${workflowId}/aprovar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      });
      if (!res.ok) throw new Error('Erro na requisição');

      const novoStatusWorkflow = acao === 'aprovar' ? 'Aprovado' : 'Rascunho';
      const novoStatusMissao = acao === 'aprovar' ? 'Em Execução' : undefined;

      setMissoes((prev) =>
        prev.map((m) => {
          if (m.id !== missaoId) return m;
          return {
            ...m,
            status: novoStatusMissao ?? m.status,
            workflows: m.workflows.map((w) =>
              w.id === workflowId ? { ...w, status: novoStatusWorkflow } : w,
            ),
          };
        }),
      );

      toast.success(acao === 'aprovar' ? 'Workflow aprovado!' : 'Workflow devolvido para revisão.');
    } catch {
      toast.error('Falha ao processar a decisão.');
    } finally {
      setLoading((l) => ({ ...l, [workflowId]: false }));
    }
  }

  function abrirEditar(missao: Missao) {
    setEditando(missao);
    setEditTitulo(missao.titulo);
    setEditDescricao(missao.descricao);
  }

  async function handleSalvarEdit() {
    if (!editando) return;
    setSalvandoEdit(true);
    try {
      const res = await fetch(`/api/missoes/${editando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: editTitulo, descricao: editDescricao }),
      });
      if (!res.ok) throw new Error();
      setMissoes((prev) =>
        prev.map((m) =>
          m.id === editando.id ? { ...m, titulo: editTitulo, descricao: editDescricao } : m,
        ),
      );
      toast.success('Missão atualizada.');
      setEditando(null);
    } catch {
      toast.error('Falha ao salvar.');
    } finally {
      setSalvandoEdit(false);
    }
  }

  async function handleApagar(missaoId: string) {
    if (!confirm('Apagar esta missão? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await fetch(`/api/missoes/${missaoId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMissoes((prev) => prev.filter((m) => m.id !== missaoId));
      toast.success('Missão apagada.');
    } catch {
      toast.error('Falha ao apagar.');
    }
  }

  const pendentes = missoes.filter((m) =>
    m.workflows.some((w) => w.status === 'Aguardando Aprovação'),
  );

  const outras = missoes.filter(
    (m) => !m.workflows.some((w) => w.status === 'Aguardando Aprovação'),
  );

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Missões</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Workflows aguardando sua aprovação para colocar os agentes em movimento.
          </p>
        </div>
        <Button
          onClick={() => setModalAberto(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white flex-shrink-0"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Missão
        </Button>
      </div>

      <NovaMissaoModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onCriada={() => router.refresh()}
      />

      {pendentes.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-orange-600 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Aguardando Aprovação ({pendentes.length})
          </h2>
          {pendentes.map((missao) =>
            missao.workflows
              .filter((w) => w.status === 'Aguardando Aprovação')
              .map((workflow) => (
                <Card key={workflow.id} className="border-orange-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">{missao.titulo}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{missao.descricao}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge className={WORKFLOW_STATUS_COLORS[workflow.status]}>
                          {workflow.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => abrirEditar(missao)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600"
                          onClick={() => handleApagar(missao.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-muted rounded-md p-4 text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {workflow.conteudo}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={loading[workflow.id]}
                        onClick={() => handleDecisao(workflow.id, missao.id, 'rejeitar')}
                      >
                        {loading[workflow.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4 mr-1" />
                        )}
                        Devolver para revisão
                      </Button>
                      <Button
                        size="sm"
                        disabled={loading[workflow.id]}
                        onClick={() => handleDecisao(workflow.id, missao.id, 'aprovar')}
                      >
                        {loading[workflow.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4 mr-1" />
                        )}
                        Aprovar Workflow
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )),
          )}
        </section>
      )}

      {outras.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Outras Missões
          </h2>
          {outras.map((missao) => (
            <Card key={missao.id} className="opacity-70 hover:opacity-100 transition-opacity">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/missoes/${missao.id}`}
                    className="text-sm font-medium hover:underline flex items-center gap-1 min-w-0 truncate"
                  >
                    {missao.titulo}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </Link>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge className={STATUS_COLORS[missao.status] ?? 'bg-gray-100 text-gray-700'}>
                      {missao.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => abrirEditar(missao)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-600"
                      onClick={() => handleApagar(missao.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </section>
      )}

      {missoes.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg">Nenhuma missão ainda.</p>
          <p className="text-sm mt-1">Clique em Nova Missão para começar.</p>
        </div>
      )}

      {/* Modal de edição */}
      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Missão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Título</label>
              <Input
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                placeholder="Título da missão"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Descrição / Contexto</label>
              <Textarea
                value={editDescricao}
                onChange={(e) => setEditDescricao(e.target.value)}
                className="min-h-[160px] resize-none text-sm"
                placeholder="Descreva o contexto completo da missão..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditando(null)} disabled={salvandoEdit}>
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarEdit}
                disabled={!editTitulo.trim() || salvandoEdit}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {salvandoEdit && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
