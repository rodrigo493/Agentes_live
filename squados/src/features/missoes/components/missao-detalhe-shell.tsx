'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  RefreshCw,
  FileText,
  CheckCircle,
  XCircle,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';

interface Entregavel {
  id: string;
  conteudo: string;
  formato: string;
  criado_em: string;
}

interface Agente {
  id: string;
  nome: string;
  papel: string;
}

interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  depende_de: string[];
  id_do_responsavel: string | null;
  entregaveis: Entregavel | null;
}

interface Workflow {
  id: string;
  conteudo: string;
  status: string;
  contexto_adicional?: string | null;
}

interface Missao {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  workflows: Workflow[];
  tarefas: Tarefa[];
}

interface Props {
  missao: Missao;
  agentes: Agente[];
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Pendente: <Circle className="w-4 h-4 text-gray-400" />,
  'Em Andamento': <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />,
  Bloqueada: <AlertCircle className="w-4 h-4 text-red-500" />,
  'Em Revisão': <Clock className="w-4 h-4 text-yellow-500" />,
  Concluída: <CheckCircle2 className="w-4 h-4 text-green-500" />,
};

const MISSAO_STATUS_COLORS: Record<string, string> = {
  Planejamento: 'bg-yellow-100 text-yellow-800',
  'Em Execução': 'bg-blue-100 text-blue-800',
  Concluída: 'bg-green-100 text-green-800',
  Cancelada: 'bg-red-100 text-red-800',
  Backlog: 'bg-gray-100 text-gray-800',
};

export function MissaoDetalheShell({ missao: initialMissao, agentes }: Props) {
  const [tarefas, setTarefas] = useState(initialMissao.tarefas);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [entregavelVisivel, setEntregavelVisivel] = useState<{
    titulo: string;
    entregavel: Entregavel;
  } | null>(null);
  const [workflow, setWorkflow] = useState(initialMissao.workflows[0]);
  const [aprovando, setAprovando] = useState(false);
  const [resposta, setResposta] = useState('');
  const [respondendo, setRespondendo] = useState(false);
  const [contexto, setContexto] = useState(initialMissao.workflows[0]?.contexto_adicional ?? '');
  const [salvandoContexto, setSalvandoContexto] = useState(false);

  const tarefaMap = Object.fromEntries(tarefas.map((t) => [t.id, t]));

  async function handleResponder() {
    if (!resposta.trim() || !workflow) return;
    setRespondendo(true);
    try {
      const res = await fetch(`/api/missoes/${initialMissao.id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resposta }),
      });
      if (!res.ok) throw new Error();
      setWorkflow((w) => ({ ...w, status: 'Rascunho' }));
      setResposta('');
      toast.success('Resposta enviada. A Orquestradora irá replanejar em até 15 minutos.');
    } catch {
      toast.error('Falha ao enviar resposta.');
    } finally {
      setRespondendo(false);
    }
  }

  async function handleSalvarContexto() {
    if (!contexto.trim() || !workflow) return;
    setSalvandoContexto(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/contexto`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contexto }),
      });
      if (!res.ok) throw new Error();
      setWorkflow((w) => ({ ...w, contexto_adicional: contexto }));
      toast.success('Contexto salvo. A Orquestradora usará isso na execução.');
    } catch {
      toast.error('Falha ao salvar contexto.');
    } finally {
      setSalvandoContexto(false);
    }
  }

  async function handleDecisao(acao: 'aprovar' | 'rejeitar') {
    if (!workflow) return;
    setAprovando(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/aprovar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      });
      if (!res.ok) throw new Error();
      setWorkflow((w) => ({ ...w, status: acao === 'aprovar' ? 'Aprovado' : 'Rascunho' }));
      toast.success(acao === 'aprovar' ? 'Workflow aprovado! Agentes em movimento.' : 'Devolvido para revisão.');
    } catch {
      toast.error('Falha ao processar decisão.');
    } finally {
      setAprovando(false);
    }
  }

  async function handleReatribuir(tarefaId: string, agenteId: string | null) {
    setSaving((s) => ({ ...s, [tarefaId]: true }));
    try {
      const res = await fetch(`/api/tarefas/${tarefaId}/responsavel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_do_responsavel: agenteId === 'none' ? null : agenteId }),
      });
      if (!res.ok) throw new Error('Falha ao reatribuir');
      setTarefas((prev) =>
        prev.map((t) =>
          t.id === tarefaId
            ? { ...t, id_do_responsavel: agenteId === 'none' ? null : agenteId }
            : t,
        ),
      );
      toast.success('Responsável atualizado.');
    } catch {
      toast.error('Erro ao reatribuir tarefa.');
    } finally {
      setSaving((s) => ({ ...s, [tarefaId]: false }));
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Missão</p>
          <h1 className="text-2xl font-bold">{initialMissao.titulo}</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{initialMissao.descricao}</p>
        </div>
        <Badge className={MISSAO_STATUS_COLORS[initialMissao.status] ?? 'bg-gray-100 text-gray-700'}>
          {initialMissao.status}
        </Badge>
      </div>

      {/* Workflow */}
      {workflow && (
        <Card className={workflow.status === 'Aguardando Aprovação' ? 'border-orange-300' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Plano da Orquestradora
              </CardTitle>
              <Badge
                className={
                  workflow.status === 'Aguardando Aprovação'
                    ? 'bg-orange-100 text-orange-800'
                    : workflow.status === 'Aprovado'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-700'
                }
              >
                {workflow.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted rounded-md p-4 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
              {workflow.conteudo}
            </div>
            {/* Contexto adicional — visível para todos os status com workflow ativo */}
            <div className="space-y-2 pt-1 border-t">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Suas respostas / clarificações para a Orquestradora
              </label>
              <Textarea
                className="min-h-[96px] resize-none text-sm"
                placeholder="Responda perguntas abertas, adicione restrições ou contexto que os agentes devem considerar na execução…"
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!contexto.trim() || salvandoContexto}
                  onClick={handleSalvarContexto}
                >
                  {salvandoContexto ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Send className="w-4 h-4 mr-1" />
                  )}
                  Salvar Resposta
                </Button>
              </div>
            </div>

            {workflow.status === 'Aguardando Aprovação' && (
              <div className="space-y-3 pt-1 border-t">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Responder à Orquestradora e Replanejar (opcional)
                  </label>
                  <Textarea
                    className="min-h-[80px] resize-none text-sm"
                    placeholder="Se preferir replanejar o workflow completo com base em novas respostas, escreva aqui…"
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!resposta.trim() || respondendo}
                    onClick={handleResponder}
                  >
                    {respondendo ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <Send className="w-4 h-4 mr-1" />
                    )}
                    Responder e Replanejar
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={aprovando}
                      onClick={() => handleDecisao('rejeitar')}
                    >
                      {aprovando ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
                      Devolver
                    </Button>
                    <Button
                      size="sm"
                      disabled={aprovando}
                      onClick={() => handleDecisao('aprovar')}
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      {aprovando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                      Aprovar Workflow
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tarefas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tarefas ({tarefas.length})
        </h2>

        {tarefas.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            As tarefas serão geradas automaticamente após a aprovação do workflow.
          </div>
        )}

        {tarefas.map((tarefa, index) => {
          const responsavelAtual = agentes.find((a) => a.id === tarefa.id_do_responsavel);
          const bloqueadaPor = (tarefa.depende_de ?? [])
            .map((depId) => tarefaMap[depId])
            .filter((dep) => dep && dep.status !== 'Concluída');
          const concluida = tarefa.status === 'Concluída';

          return (
            <Card key={tarefa.id} className={bloqueadaPor.length > 0 ? 'opacity-60' : ''}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {STATUS_ICONS[tarefa.status] ?? <Circle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono">#{index + 1}</span>
                      <span className="font-medium text-sm">{tarefa.titulo}</span>
                      <Badge variant="outline" className="text-xs">
                        {tarefa.status}
                      </Badge>
                      {concluida && tarefa.entregaveis && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-green-700"
                          onClick={() =>
                            setEntregavelVisivel({
                              titulo: tarefa.titulo,
                              entregavel: tarefa.entregaveis!,
                            })
                          }
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Ver entregável
                        </Button>
                      )}
                    </div>

                    {tarefa.descricao && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {tarefa.descricao}
                      </p>
                    )}

                    {bloqueadaPor.length > 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        Aguarda: {bloqueadaPor.map((d) => d.titulo).join(', ')}
                      </p>
                    )}

                    {!concluida && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Responsável:</span>
                        {saving[tarefa.id] ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Select
                            value={tarefa.id_do_responsavel ?? 'none'}
                            onValueChange={(val) => handleReatribuir(tarefa.id, val)}
                          >
                            <SelectTrigger className="h-7 text-xs w-52">
                              <SelectValue placeholder="Sem responsável" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem responsável</SelectItem>
                              {agentes.map((agente) => (
                                <SelectItem key={agente.id} value={agente.id}>
                                  {agente.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {responsavelAtual && (
                          <span className="text-xs text-muted-foreground">
                            — {responsavelAtual.papel}
                          </span>
                        )}
                      </div>
                    )}

                    {concluida && responsavelAtual && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Concluída por: {responsavelAtual.nome}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Modal do Entregável */}
      <Dialog open={!!entregavelVisivel} onOpenChange={() => setEntregavelVisivel(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">{entregavelVisivel?.titulo}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-2">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{entregavelVisivel?.entregavel.conteudo ?? ''}</ReactMarkdown>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
