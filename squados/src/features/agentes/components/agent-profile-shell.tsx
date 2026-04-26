'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { resolveAgent } from '@/features/agentes/constants/agent-map';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Agente {
  id: string;
  nome: string;
  papel: string;
  soul_prompt: string;
  heartbeat_ativo: boolean;
  modelo: string;
  ferramentas_habilitadas: string[];
  tarefas_ativas: number;
  tarefas_concluidas: number;
}

interface TarefaAtiva {
  id: string;
  titulo: string;
  status: string;
  criado_em: string;
  atualizado_em: string;
  workflows: { id: string; missoes: { id: string; titulo: string } | null } | null;
}

interface Entregavel {
  id: string;
  conteudo: string;
  formato: string;
  criado_em: string;
  tarefas: { id: string; titulo: string } | null;
}

interface Comentario {
  id: string;
  conteudo: string;
  tipo: string;
  mencoes: string[] | null;
  criado_em: string;
  tarefas: { id: string; titulo: string } | null;
}

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
}

interface Missao {
  id: string;
  titulo: string;
  workflows: { id: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Pendente':     { bg: '#fff7ed', text: '#c2410c' },
  'Em Andamento': { bg: '#f0fdf4', text: '#15803d' },
  'Em Revisão':   { bg: '#faf5ff', text: '#7e22ce' },
  'Concluída':    { bg: '#f1f5f9', text: '#475569' },
};

const TIPO_COLORS: Record<string, string> = {
  nota:      'bg-slate-100 text-slate-600',
  entrega:   'bg-green-100 text-green-700',
  bloqueio:  'bg-red-100 text-red-700',
  pergunta:  'bg-blue-100 text-blue-700',
  aprovacao: 'bg-purple-100 text-purple-700',
};

const MODELOS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AgentProfileShell({ agente }: { agente: Agente }) {
  const router = useRouter();
  const info = resolveAgent(agente.nome, agente.papel);

  // ── Soul edit ──
  const [editingSoul, setEditingSoul] = useState(false);
  const [soulDraft, setSoulDraft] = useState(agente.soul_prompt);
  const [savingSoul, setSavingSoul] = useState(false);

  // ── Tab data ──
  const [tarefas, setTarefas]           = useState<TarefaAtiva[]>([]);
  const [loadingTarefas, setLoadingTarefas] = useState(false);
  const [tarefasLoaded, setTarefasLoaded] = useState(false);

  const [historico, setHistorico]       = useState<Entregavel[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [historicoLoaded, setHistoricoLoaded] = useState(false);

  const [comunicacao, setComunicacao]   = useState<Comentario[]>([]);
  const [loadingCom, setLoadingCom]     = useState(false);
  const [comLoaded, setComLoaded]       = useState(false);

  const [cronJobs, setCronJobs]         = useState<CronJob[]>([]);
  const [loadingCrons, setLoadingCrons] = useState(false);
  const [cronsLoaded, setCronsLoaded]   = useState(false);

  const [missoes, setMissoes]           = useState<Missao[]>([]);
  const [missoesLoaded, setMissoesLoaded] = useState(false);

  // ── Heartbeat ──
  const [heartbeatAtivo, setHeartbeatAtivo] = useState(agente.heartbeat_ativo);
  const [cronExprEdit, setCronExprEdit]  = useState('*/15 * * * *');
  const [modeloEdit, setModeloEdit]      = useState(agente.modelo);
  const [savingHB, setSavingHB]          = useState(false);

  // ── Modal entregável ──
  const [modalEntregavel, setModalEntregavel] = useState<Entregavel | null>(null);

  // ── Nova tarefa ──
  const [ntTitulo, setNtTitulo]     = useState('');
  const [ntDesc, setNtDesc]         = useState('');
  const [ntWorkflow, setNtWorkflow] = useState('none');
  const [criando, setCriando]       = useState(false);

  // ── Lazy loaders ──────────────────────────────────────────────────────────

  const loadTarefas = useCallback(async () => {
    if (tarefasLoaded) return;
    setLoadingTarefas(true);
    try {
      const r = await fetch(`/api/agentes/${agente.id}/tarefas-ativas`);
      const d = await r.json();
      setTarefas(d.tarefas ?? []);
      setTarefasLoaded(true);
    } finally { setLoadingTarefas(false); }
  }, [agente.id, tarefasLoaded]);

  const loadHistorico = useCallback(async () => {
    if (historicoLoaded) return;
    setLoadingHistorico(true);
    try {
      const r = await fetch(`/api/agentes/${agente.id}/historico`);
      const d = await r.json();
      setHistorico(d.entregaveis ?? []);
      setHistoricoLoaded(true);
    } finally { setLoadingHistorico(false); }
  }, [agente.id, historicoLoaded]);

  const loadComunicacao = useCallback(async () => {
    if (comLoaded) return;
    setLoadingCom(true);
    try {
      const r = await fetch(`/api/agentes/${agente.id}/comunicacao`);
      const d = await r.json();
      setComunicacao(d.comentarios ?? []);
      setComLoaded(true);
    } finally { setLoadingCom(false); }
  }, [agente.id, comLoaded]);

  const loadCrons = useCallback(async () => {
    if (cronsLoaded) return;
    setLoadingCrons(true);
    try {
      const r = await fetch(`/api/agentes/${agente.id}/crons`);
      const d = await r.json();
      const jobs = (d.jobs ?? []) as CronJob[];
      setCronJobs(jobs);
      // Pré-popular o campo de edição com o schedule do job correspondente
      const relevant = jobs.find(j =>
        j.jobname.includes('especialista') || j.jobname.includes('orquestradora')
      );
      if (relevant) setCronExprEdit(relevant.schedule);
      setCronsLoaded(true);
    } finally { setLoadingCrons(false); }
  }, [agente.id, cronsLoaded]);

  const loadMissoes = useCallback(async () => {
    if (missoesLoaded) return;
    try {
      const r = await fetch('/api/missoes');
      if (!r.ok) return;
      const d = await r.json();
      setMissoes(d.missoes ?? []);
      setMissoesLoaded(true);
    } catch { /* silent */ }
  }, [missoesLoaded]);

  function handleTabChange(value: string) {
    if (value === 'trabalhando') loadTarefas();
    if (value === 'historico') loadHistorico();
    if (value === 'comunicacao') loadComunicacao();
    if (value === 'heartbeat') loadCrons();
    if (value === 'nova-tarefa') loadMissoes();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleSaveSoul() {
    setSavingSoul(true);
    try {
      const r = await fetch(`/api/agentes/${agente.id}/soul`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soul_prompt: soulDraft }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Soul atualizado com sucesso');
      setEditingSoul(false);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao salvar');
    } finally { setSavingSoul(false); }
  }

  async function handleSaveHeartbeat() {
    setSavingHB(true);
    try {
      // Determinar qual job pertence a este agente
      const isOrq = agente.nome.toLowerCase().includes('laivinha') ||
                    agente.papel.toLowerCase().includes('orquestradora');
      const jobName = isOrq ? 'heartbeat-orquestradora' : 'heartbeat-especialistas';

      const r = await fetch(`/api/agentes/${agente.id}/heartbeat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelo: modeloEdit,
          job_name: jobName,
          schedule: cronExprEdit,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Heartbeat atualizado');
      setCronsLoaded(false); // força reload
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao salvar');
    } finally { setSavingHB(false); }
  }

  async function handleToggleHeartbeat(jobName: string, currentlyActive: boolean) {
    try {
      const r = await fetch(`/api/agentes/${agente.id}/heartbeat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heartbeat_ativo: !currentlyActive,
          job_name: jobName,
          schedule: currentlyActive ? '59 23 31 2 *' : '*/15 * * * *',
        }),
      });
      if (!r.ok) throw new Error();
      setHeartbeatAtivo(!currentlyActive);
      setCronJobs(prev => prev.map(j =>
        j.jobname === jobName
          ? { ...j, schedule: currentlyActive ? '59 23 31 2 *' : '*/15 * * * *' }
          : j
      ));
      toast.success(currentlyActive ? 'Heartbeat pausado' : 'Heartbeat reativado');
    } catch {
      toast.error('Erro ao alterar heartbeat');
    }
  }

  async function handleCriarTarefa() {
    if (!ntTitulo.trim()) return;
    setCriando(true);
    try {
      const workflowId = ntWorkflow !== 'none' ? ntWorkflow : undefined;
      const r = await fetch('/api/tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: ntTitulo,
          descricao: ntDesc || undefined,
          id_do_responsavel: agente.id,
          id_do_workflow: workflowId,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(`Tarefa criada. ${agente.nome.split(' ')[0]} irá executar em até 15 minutos.`);
      setNtTitulo('');
      setNtDesc('');
      setNtWorkflow('none');
      setTarefasLoaded(false); // força reload ao voltar para aba
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Erro ao criar tarefa');
    } finally { setCriando(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap');
        .ap { font-family: 'DM Sans', system-ui, sans-serif; }
        .ap-title { font-family: 'Syne', sans-serif; }
        .ap-mono { font-family: 'JetBrains Mono', monospace; }
        .ap-scroll::-webkit-scrollbar { width: 4px; }
        .ap-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
        @keyframes ap-pulse { 0%,100%{opacity:1}50%{opacity:.35} }
        .ap-live { animation: ap-pulse 1.5s ease-in-out infinite; }
        .prose-sm p { margin: 0.25rem 0; }
        .prose-sm h1,.prose-sm h2,.prose-sm h3 { font-weight:700; margin:0.5rem 0 0.25rem; }
        .prose-sm ul,.prose-sm ol { padding-left:1.25rem; }
        .prose-sm li { margin: 0.1rem 0; }
        .prose-sm code { background:#f1f5f9; padding:0.1em 0.3em; border-radius:4px; font-size:0.85em; }
        .prose-sm pre { background:#1e293b; color:#e2e8f0; padding:0.75rem; border-radius:8px; overflow-x:auto; }
        .prose-sm pre code { background:none; padding:0; }
        .prose-sm blockquote { border-left:3px solid #f97316; padding-left:0.75rem; color:#64748b; }
      `}</style>

      <div className="ap flex flex-col bg-[#f0f2f7] min-h-screen">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <button
            onClick={() => router.push('/admin/mission-control')}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-orange-500 transition-colors mb-4"
          >
            ← Mission Control
          </button>

          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ backgroundColor: info.cor + '22', border: `2.5px solid ${info.cor}` }}
            >
              {info.emoji}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="ap-title text-xl font-bold text-slate-900">{info.displayName}</h1>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: info.role === 'LEAD' ? '#fef3c7' : '#dbeafe',
                    color: info.role === 'LEAD' ? '#92400e' : '#1e40af',
                  }}
                >
                  {info.role}
                </span>
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${agente.tarefas_ativas > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${agente.tarefas_ativas > 0 ? 'bg-emerald-500 ap-live' : 'bg-slate-300'}`} />
                  {agente.tarefas_ativas > 0 ? 'Working' : 'Idle'}
                </span>
              </div>

              <p className="text-sm text-slate-500 mb-1">{agente.nome} · {agente.papel}</p>

              <div className="flex items-center gap-3 text-[12px] text-slate-400">
                <span className="ap-mono bg-slate-100 px-2 py-0.5 rounded">{agente.modelo}</span>
                <span>{agente.tarefas_ativas} ativa{agente.tarefas_ativas !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{agente.tarefas_concluidas} concluída{agente.tarefas_concluidas !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span className={`font-medium ${heartbeatAtivo ? 'text-emerald-600' : 'text-red-500'}`}>
                  {heartbeatAtivo ? '🟢 Heartbeat ativo' : '🔴 Heartbeat pausado'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="flex-1 px-6 py-4">
          <Tabs defaultValue="identidade" onValueChange={handleTabChange} className="w-full">
            <TabsList className="bg-white border border-slate-200 p-1 mb-4 h-auto flex-wrap gap-1">
              <TabsTrigger value="identidade"   className="text-[12px] font-semibold">🧬 Identidade</TabsTrigger>
              <TabsTrigger value="trabalhando"  className="text-[12px] font-semibold">⚡ Trabalhando</TabsTrigger>
              <TabsTrigger value="historico"    className="text-[12px] font-semibold">📦 Histórico</TabsTrigger>
              <TabsTrigger value="comunicacao"  className="text-[12px] font-semibold">💬 Comunicação</TabsTrigger>
              <TabsTrigger value="heartbeat"    className="text-[12px] font-semibold">🫀 Heartbeat</TabsTrigger>
              <TabsTrigger value="nova-tarefa"  className="text-[12px] font-semibold text-orange-600">+ Nova Tarefa</TabsTrigger>
            </TabsList>

            {/* ── Aba 1: Identidade ──────────────────────────────────── */}
            <TabsContent value="identidade">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Soul Prompt</span>
                  {!editingSoul ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[12px] h-7"
                      onClick={() => setEditingSoul(true)}
                    >
                      ✏️ Editar Soul
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[12px] h-7"
                        onClick={() => { setEditingSoul(false); setSoulDraft(agente.soul_prompt); }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        className="text-[12px] h-7 bg-orange-500 hover:bg-orange-600"
                        disabled={savingSoul}
                        onClick={handleSaveSoul}
                      >
                        {savingSoul ? 'Salvando…' : 'Salvar'}
                      </Button>
                    </div>
                  )}
                </div>

                {editingSoul ? (
                  <div className="p-4">
                    <Textarea
                      value={soulDraft}
                      onChange={(e) => setSoulDraft(e.target.value)}
                      className="font-mono text-[12px] leading-relaxed min-h-[500px] resize-y border-slate-200"
                      placeholder="Escreva o soul prompt do agente..."
                    />
                    <p className="text-[10px] text-slate-400 mt-1">{soulDraft.length} caracteres</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[600px]">
                    <div className="p-6 prose-sm max-w-none text-slate-700 text-[13px] leading-relaxed">
                      <ReactMarkdown>{agente.soul_prompt}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                )}
              </div>
            </TabsContent>

            {/* ── Aba 2: Trabalhando ─────────────────────────────────── */}
            <TabsContent value="trabalhando">
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Tarefas Ativas</span>
                  <button
                    onClick={() => { setTarefasLoaded(false); loadTarefas(); }}
                    className="text-[11px] text-slate-400 hover:text-slate-600"
                  >
                    ↻ Atualizar
                  </button>
                </div>
                {loadingTarefas ? (
                  <div className="py-12 text-center text-slate-400 text-sm">Carregando…</div>
                ) : tarefas.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-2xl mb-2">🎉</p>
                    <p className="text-sm text-slate-500">Nenhuma tarefa ativa no momento.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {tarefas.map((t) => {
                      const sc = STATUS_COLORS[t.status] ?? STATUS_COLORS['Pendente'];
                      const missao = t.workflows?.missoes;
                      return (
                        <div key={t.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-slate-800 leading-snug mb-1">
                                {t.titulo}
                              </p>
                              {missao && (
                                <p className="text-[11px] text-slate-400">
                                  Missão: <span className="text-slate-600 font-medium">{missao.titulo}</span>
                                </p>
                              )}
                              <p className="text-[10px] text-slate-400 mt-1">{timeAgo(t.atualizado_em ?? t.criado_em)}</p>
                            </div>
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                              style={{ backgroundColor: sc.bg, color: sc.text }}
                            >
                              {t.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Aba 3: Histórico ───────────────────────────────────── */}
            <TabsContent value="historico">
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="px-5 py-3 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Entregáveis Produzidos</span>
                </div>
                {loadingHistorico ? (
                  <div className="py-12 text-center text-slate-400 text-sm">Carregando…</div>
                ) : historico.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-2xl mb-2">📭</p>
                    <p className="text-sm text-slate-500">Nenhum entregável ainda.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {historico.map((e) => (
                      <button
                        key={e.id}
                        className="w-full px-5 py-4 text-left hover:bg-slate-50 transition-colors group"
                        onClick={() => setModalEntregavel(e)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-slate-800 leading-snug mb-0.5 group-hover:text-orange-600 transition-colors">
                              {e.tarefas?.titulo ?? 'Tarefa removida'}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {fmtDate(e.criado_em)} · {e.formato}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                              {e.conteudo.slice(0, 120)}…
                            </p>
                          </div>
                          <span className="text-slate-300 group-hover:text-orange-400 text-lg flex-shrink-0">›</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Aba 4: Comunicação ─────────────────────────────────── */}
            <TabsContent value="comunicacao">
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="px-5 py-3 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Mensagens & Menções</span>
                </div>
                {loadingCom ? (
                  <div className="py-12 text-center text-slate-400 text-sm">Carregando…</div>
                ) : comunicacao.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-2xl mb-2">💬</p>
                    <p className="text-sm text-slate-500">Nenhuma comunicação registrada.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {comunicacao.map((c) => (
                      <div key={c.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${TIPO_COLORS[c.tipo] ?? TIPO_COLORS.nota}`}>
                            {c.tipo}
                          </span>
                          <span className="text-[10px] text-slate-400">{timeAgo(c.criado_em)}</span>
                        </div>
                        <p className="text-[13px] text-slate-700 leading-relaxed mb-1">{c.conteudo}</p>
                        {c.tarefas && (
                          <p className="text-[10px] text-slate-400">↳ {c.tarefas.titulo}</p>
                        )}
                        {c.mencoes && c.mencoes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {c.mencoes.map((m) => (
                              <span key={m} className="text-[9px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                                @{m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Aba 5: Heartbeat ───────────────────────────────────── */}
            <TabsContent value="heartbeat">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Status dos jobs */}
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Status do Heartbeat</span>
                  </div>
                  {loadingCrons ? (
                    <div className="py-12 text-center text-slate-400 text-sm">Carregando…</div>
                  ) : cronJobs.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400 px-5">
                      <p className="mb-2">ℹ️</p>
                      <p>Aplique a migration 00060 para habilitar o gerenciamento de crons.</p>
                      <code className="text-[11px] bg-slate-100 px-2 py-1 rounded mt-2 block">npx supabase db push</code>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {cronJobs.map((job) => {
                        const isPaused = job.schedule === '59 23 31 2 *';
                        return (
                          <div key={job.jobid} className="px-5 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-slate-800">{job.jobname}</p>
                                <p className="ap-mono text-[11px] text-slate-500 mt-0.5">
                                  {isPaused ? '⏸ Pausado' : job.schedule}
                                </p>
                              </div>
                              <button
                                onClick={() => handleToggleHeartbeat(job.jobname, !isPaused)}
                                className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors ${
                                  isPaused
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {isPaused ? '▶ Reativar' : '⏸ Pausar'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Editar heartbeat */}
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Editar Configuração</span>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-semibold text-slate-600">Expressão Cron</label>
                      <Input
                        value={cronExprEdit}
                        onChange={(e) => setCronExprEdit(e.target.value)}
                        placeholder="*/15 * * * *"
                        className="ap-mono text-[12px]"
                      />
                      <p className="text-[10px] text-slate-400">Ex: */15 * * * * (a cada 15 min) · 0 * * * * (a cada hora)</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[12px] font-semibold text-slate-600">Modelo</label>
                      <Select value={modeloEdit} onValueChange={(v) => v && setModeloEdit(v)}>
                        <SelectTrigger className="text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MODELOS.map((m) => (
                            <SelectItem key={m} value={m} className="text-[12px] ap-mono">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      onClick={handleSaveHeartbeat}
                      disabled={savingHB}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-[13px]"
                    >
                      {savingHB ? 'Salvando…' : 'Salvar Alterações'}
                    </Button>

                    <p className="text-[10px] text-slate-400 text-center">
                      ⚠️ O schedule é compartilhado com agentes do mesmo tipo.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Aba 6: Nova Tarefa ─────────────────────────────────── */}
            <TabsContent value="nova-tarefa">
              <div className="bg-white rounded-xl border border-slate-200 max-w-2xl">
                <div className="px-5 py-3 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    Atribuir Tarefa para {info.displayName}
                  </span>
                </div>
                <div className="p-6 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-semibold text-slate-700">Título *</label>
                    <Input
                      value={ntTitulo}
                      onChange={(e) => setNtTitulo(e.target.value)}
                      placeholder={`O que você quer que ${info.displayName} faça?`}
                      className="text-[13px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-semibold text-slate-700">Instrução detalhada</label>
                    <Textarea
                      value={ntDesc}
                      onChange={(e) => setNtDesc(e.target.value)}
                      placeholder="Descreva exatamente o que você quer que este agente faça. Quanto mais contexto, melhor o resultado."
                      className="text-[13px] leading-relaxed min-h-[140px] resize-y"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-semibold text-slate-700">Missão relacionada</label>
                    <Select value={ntWorkflow} onValueChange={(v) => v && setNtWorkflow(v)}>
                      <SelectTrigger className="text-[13px]">
                        <SelectValue placeholder="Selecionar missão (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-[12px] text-slate-400">Tarefa avulsa (sem missão)</SelectItem>
                        {missoes.map((m) => (
                          m.workflows?.map((w) => (
                            <SelectItem key={w.id} value={w.id} className="text-[12px]">
                              {m.titulo}
                            </SelectItem>
                          ))
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      onClick={handleCriarTarefa}
                      disabled={criando || !ntTitulo.trim()}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 text-[13px] font-semibold"
                    >
                      {criando ? 'Criando…' : `✓ Criar e Atribuir para ${info.displayName}`}
                    </Button>
                  </div>

                  <p className="text-[11px] text-slate-400 text-center">
                    A tarefa ficará pendente até o próximo heartbeat (até 15 minutos).
                  </p>
                </div>
              </div>
            </TabsContent>

          </Tabs>
        </div>
      </div>

      {/* ── Modal Entregável ─────────────────────────────────────────── */}
      <Dialog open={!!modalEntregavel} onOpenChange={(v) => !v && setModalEntregavel(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {modalEntregavel?.tarefas?.titulo ?? 'Entregável'}
            </DialogTitle>
            <p className="text-xs text-slate-400">
              {modalEntregavel && fmtDate(modalEntregavel.criado_em)} · {modalEntregavel?.formato}
            </p>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh]">
            <div className="prose-sm max-w-none text-slate-700 text-[13px] leading-relaxed p-1">
              {modalEntregavel && <ReactMarkdown>{modalEntregavel.conteudo}</ReactMarkdown>}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
