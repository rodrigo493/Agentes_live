'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

// ─── Types ─────────────────────────────────────────────────────────────
interface AgenteConfig {
  id: string;
  nome: string;
  papel: string;
}

interface Entregavel {
  id: string;
  conteudo: string;
  formato: string;
}

interface TarefaComContexto {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  criado_em: string;
  atualizado_em: string;
  id_do_responsavel: string | null;
  id_do_entregavel: string | null;
  depende_de: string[];
  agentes_config: { id: string; nome: string; papel: string } | null;
  workflows: { id: string; missoes: { id: string; titulo: string } | null } | null;
  entregaveis: Entregavel | null;
}

interface Props {
  initialTarefas: TarefaComContexto[];
  initialAgentes: AgenteConfig[];
}

// ─── Constants ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
  '#14b8a6','#f43f5e','#84cc16','#a855f7',
];

const KANBAN_COLS = [
  { key: 'INBOX',       label: 'INBOX',       color: '#f97316', dot: '#f97316', filter: (t: TarefaComContexto) => t.status === 'Pendente' && !t.id_do_responsavel },
  { key: 'ASSIGNED',    label: 'ASSIGNED',    color: '#3b82f6', dot: '#3b82f6', filter: (t: TarefaComContexto) => t.status === 'Pendente' && !!t.id_do_responsavel },
  { key: 'IN PROGRESS', label: 'IN PROGRESS', color: '#22c55e', dot: '#22c55e', filter: (t: TarefaComContexto) => t.status === 'Em Andamento' },
  { key: 'REVIEW',      label: 'REVIEW',      color: '#8b5cf6', dot: '#8b5cf6', filter: (t: TarefaComContexto) => t.status === 'Em Revisão' },
  { key: 'DONE',        label: 'DONE',        color: '#94a3b8', dot: '#94a3b8', filter: (t: TarefaComContexto) => t.status === 'Concluída' },
];

// ─── Utilities ─────────────────────────────────────────────────────────
function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function initials(nome: string) {
  return nome
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

function getTags(titulo: string): string[] {
  const stop = new Set(['de','da','do','dos','das','para','com','e','a','o','as','os','um','uma','no','na','por']);
  return titulo
    .toLowerCase()
    .split(/[\s\-_,]+/)
    .filter((w) => w.length > 2 && !stop.has(w))
    .slice(0, 3);
}

function getRoleBadge(papel: string): { label: string; bg: string; text: string } {
  const p = papel.toLowerCase();
  if (p.includes('orquestradora') || p.includes('coordenad') || p.includes('lead') || p.includes('gestora'))
    return { label: 'LEAD', bg: '#fef3c7', text: '#92400e' };
  if (p.includes('pesquisa') || p.includes('redator') || p.includes('analista') || p.includes('especialista'))
    return { label: 'SPC', bg: '#dbeafe', text: '#1e40af' };
  return { label: 'INT', bg: '#ede9fe', text: '#5b21b6' };
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
}

// ─── Component ─────────────────────────────────────────────────────────
export function MissionControlShell({ initialTarefas, initialAgentes }: Props) {
  const [tarefas, setTarefas] = useState<TarefaComContexto[]>(initialTarefas);
  const [agentes] = useState<AgenteConfig[]>(initialAgentes);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<string>('all');
  const [modalTarefa, setModalTarefa] = useState<TarefaComContexto | null>(null);
  const [now, setNow] = useState(new Date());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Polling 30s
  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/mission-control');
      if (!res.ok) return;
      const data = await res.json();
      setTarefas(data.tarefas ?? []);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(poll, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  // Derived
  const agentIndexMap = Object.fromEntries(agentes.map((a, i) => [a.id, i]));
  const workingIds = new Set(tarefas.filter((t) => t.status === 'Em Andamento').map((t) => t.id_do_responsavel).filter(Boolean));
  const activeCount = workingIds.size;
  const queueCount = tarefas.filter((t) => t.status !== 'Concluída').length;

  const filteredTarefas = selectedAgentId
    ? tarefas.filter((t) => t.id_do_responsavel === selectedAgentId)
    : tarefas;

  const feedTarefas = feedFilter === 'all'
    ? tarefas.slice(0, 40)
    : tarefas.filter((t) => t.id_do_responsavel === feedFilter).slice(0, 40);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');
        .mc { font-family: 'DM Sans', system-ui, sans-serif; }
        .mc-title { font-family: 'Syne', sans-serif; }
        .mc-mono { font-family: 'JetBrains Mono', monospace; }
        .mc-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .mc-scroll::-webkit-scrollbar-track { background: transparent; }
        .mc-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
        .mc-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-1px); }
        .mc-card { transition: box-shadow 0.15s, transform 0.15s; }
        @keyframes mc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .mc-live { animation: mc-pulse 1.5s ease-in-out infinite; }
        @keyframes mc-ping { 0% { transform: scale(1); opacity: 1; } 75%,100% { transform: scale(2); opacity: 0; } }
        .mc-ping { animation: mc-ping 1.2s cubic-bezier(0,0,0.2,1) infinite; }
      `}</style>

      <div
        className="mc flex flex-col overflow-hidden bg-[#f0f2f7]"
        style={{ height: 'calc(100vh - 56px)' }}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-5 h-14 flex items-center justify-between gap-4 z-10">
          {/* Left */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <polygon points="10,2 18,7 18,13 10,18 2,13 2,7" fill="#f97316" opacity="0.15" stroke="#f97316" strokeWidth="1.5"/>
                <polygon points="10,5 15,8 15,12 10,15 5,12 5,8" fill="#f97316"/>
              </svg>
              <span className="mc-title text-[15px] font-bold tracking-wide text-slate-900 uppercase">
                Mission Control
              </span>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              Live Universe
            </span>
          </div>

          {/* Center stats */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="mc-mono text-xl font-medium text-slate-900 leading-none">{activeCount}</p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Agentes Ativos</p>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="text-center">
              <p className="mc-mono text-xl font-medium text-slate-900 leading-none">{queueCount}</p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Tarefas na Fila</p>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="mc-mono text-sm font-medium text-slate-800 leading-none">{formatClock(now)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(now)}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="mc-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Online</span>
            </div>
          </div>
        </header>

        {/* ── Body: 3 columns ────────────────────────────── */}
        <div className="flex flex-1 min-h-0 gap-0">

          {/* ── Col 1: AGENTS ────────────────────────── */}
          <aside className="flex-shrink-0 w-[200px] bg-white border-r border-slate-200 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Agentes</span>
              <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {agentes.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto mc-scroll">
              {/* All filter */}
              <button
                onClick={() => setSelectedAgentId(null)}
                className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left ${!selectedAgentId ? 'bg-orange-50' : ''}`}
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-bold text-slate-500">All</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-slate-700 truncate">Todos</p>
                  <p className="text-[10px] text-slate-400">Ver todas as tarefas</p>
                </div>
              </button>

              {agentes.map((agente, idx) => {
                const isWorking = workingIds.has(agente.id);
                const isSelected = selectedAgentId === agente.id;
                const role = getRoleBadge(agente.papel);
                const color = avatarColor(idx);
                return (
                  <button
                    key={agente.id}
                    onClick={() => setSelectedAgentId(isSelected ? null : agente.id)}
                    className={`w-full px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 ${isSelected ? 'bg-orange-50' : ''}`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold mt-0.5"
                      style={{ backgroundColor: color }}
                    >
                      {initials(agente.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-semibold text-slate-800 truncate max-w-[80px]">
                          {agente.nome.split(' ')[0]}
                        </span>
                        <span
                          className="text-[9px] font-bold px-1 py-0.5 rounded"
                          style={{ backgroundColor: role.bg, color: role.text }}
                        >
                          {role.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{agente.papel.split(' ').slice(0, 3).join(' ')}</p>
                      <div className={`flex items-center gap-1 mt-1 ${isWorking ? 'text-emerald-600' : 'text-slate-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isWorking ? 'bg-emerald-500 mc-live' : 'bg-slate-300'}`} />
                        <span className="text-[9px] font-semibold uppercase tracking-wide">
                          {isWorking ? 'Working' : 'Idle'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Col 2: KANBAN ───────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Mission Queue</span>
                {selectedAgentId && (
                  <span className="text-[11px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    filtrado por {agentes.find((a) => a.id === selectedAgentId)?.nome.split(' ')[0]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-slate-500 font-medium">{filteredTarefas.filter(t=>t.status!=='Concluída').length} active</span>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden mc-scroll">
              <div className="flex h-full gap-0 min-w-max">
                {KANBAN_COLS.map((col) => {
                  const cards = filteredTarefas.filter(col.filter);
                  return (
                    <div key={col.key} className="flex flex-col w-[240px] flex-shrink-0 border-r border-slate-200 last:border-r-0">
                      {/* Column header */}
                      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-3 bg-white border-b border-slate-100">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.dot }} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{col.label}</span>
                        <span className="ml-auto text-[11px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {cards.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="flex-1 overflow-y-auto mc-scroll px-2 py-2 space-y-2 bg-[#f0f2f7]">
                        {cards.length === 0 && (
                          <div className="text-center py-8 text-slate-400 text-[11px]">–</div>
                        )}
                        {cards.map((tarefa, cardIdx) => {
                          const agente = tarefa.agentes_config;
                          const agenteIdx = agente ? (agentIndexMap[agente.id] ?? 0) : 0;
                          const missaoTitulo = tarefa.workflows?.missoes?.titulo ?? null;
                          const tags = getTags(tarefa.titulo);
                          return (
                            <div
                              key={tarefa.id}
                              className="mc-card bg-white rounded-lg p-3 cursor-pointer border border-slate-100"
                              style={{ borderLeft: `3px solid ${col.color}` }}
                              onClick={() => setModalTarefa(tarefa)}
                            >
                              {/* Priority + mission */}
                              <div className="flex items-start justify-between gap-1 mb-1.5">
                                <span className="text-[10px] font-semibold text-slate-300 mc-mono">{cardIdx + 1}</span>
                                {missaoTitulo && (
                                  <span className="text-[9px] text-slate-400 truncate max-w-[130px]" title={missaoTitulo}>
                                    {missaoTitulo.slice(0, 22)}{missaoTitulo.length > 22 ? '…' : ''}
                                  </span>
                                )}
                              </div>

                              {/* Title */}
                              <p className="text-[12px] font-semibold text-slate-800 leading-snug mb-1 line-clamp-2">
                                {tarefa.titulo}
                              </p>

                              {/* Description */}
                              {tarefa.descricao && (
                                <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                                  {tarefa.descricao}
                                </p>
                              )}

                              {/* Agent + time */}
                              {agente ? (
                                <div className="flex items-center gap-1.5 mb-2">
                                  <div
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                                    style={{ backgroundColor: avatarColor(agenteIdx) }}
                                  >
                                    {initials(agente.nome)}
                                  </div>
                                  <span className="text-[10px] text-slate-500 truncate">{agente.nome.split(' ').slice(0,2).join(' ')}</span>
                                  <span className="text-[10px] text-slate-300 ml-auto flex-shrink-0">{timeAgo(tarefa.atualizado_em ?? tarefa.criado_em)}</span>
                                </div>
                              ) : (
                                <p className="text-[10px] text-slate-300 mb-2">{timeAgo(tarefa.criado_em)}</p>
                              )}

                              {/* Tags */}
                              <div className="flex flex-wrap gap-1">
                                {tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Col 3: LIVE FEED ─────────────────────── */}
          <aside className="flex-shrink-0 w-[260px] bg-white border-l border-slate-200 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Live Feed</span>
            </div>

            {/* Agent filter chips */}
            <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1">
              <button
                onClick={() => setFeedFilter('all')}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${feedFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                Todos
              </button>
              {agentes.slice(0, 5).map((a, idx) => (
                <button
                  key={a.id}
                  onClick={() => setFeedFilter(feedFilter === a.id ? 'all' : a.id)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${feedFilter === a.id ? 'text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  style={feedFilter === a.id ? { backgroundColor: avatarColor(idx) } : {}}
                >
                  {a.nome.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Feed list */}
            <div className="flex-1 overflow-y-auto mc-scroll divide-y divide-slate-50">
              {feedTarefas.map((tarefa) => {
                const agente = tarefa.agentes_config;
                const idx = agente ? (agentIndexMap[agente.id] ?? 0) : 0;
                const statusLabel: Record<string, string> = {
                  'Pendente': 'criou',
                  'Em Andamento': 'iniciou',
                  'Em Revisão': 'enviou para revisão',
                  'Concluída': 'concluiu',
                };
                const action = statusLabel[tarefa.status] ?? 'atualizou';
                return (
                  <button
                    key={tarefa.id}
                    className="w-full px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 transition-colors text-left group"
                    onClick={() => setModalTarefa(tarefa)}
                  >
                    {agente ? (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: avatarColor(idx) }}
                      >
                        {initials(agente.nome)}
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-700 leading-relaxed">
                        <span className="font-semibold">{agente?.nome.split(' ')[0] ?? 'Sistema'}</span>
                        {' '}{action}{' '}
                        <span className="text-slate-500 italic">"{tarefa.titulo.slice(0, 35)}{tarefa.titulo.length > 35 ? '…' : ''}"</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(tarefa.atualizado_em ?? tarefa.criado_em)}</p>
                    </div>
                    <span className="text-slate-300 group-hover:text-slate-500 transition-colors text-[12px] flex-shrink-0 mt-1">›</span>
                  </button>
                );
              })}
              {feedTarefas.length === 0 && (
                <p className="text-center text-slate-400 text-[11px] py-8">Nenhuma atividade</p>
              )}
            </div>

            {/* LIVE badge */}
            <div className="flex-shrink-0 border-t border-slate-100 px-4 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 mc-live" />
              <span className="text-[11px] font-bold text-red-500 uppercase tracking-widest">Live</span>
              <span className="text-[10px] text-slate-400 ml-1">· atualiza a cada 30s</span>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Task Detail Modal ────────────────────────────── */}
      <Dialog open={!!modalTarefa} onOpenChange={(v) => !v && setModalTarefa(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-start gap-3">
              {modalTarefa && (() => {
                const col = KANBAN_COLS.find((c) => c.filter(modalTarefa)) ?? KANBAN_COLS[0];
                return (
                  <div
                    className="w-1 self-stretch rounded-full flex-shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                );
              })()}
              <div className="flex-1">
                <DialogTitle className="text-base font-semibold leading-snug">
                  {modalTarefa?.titulo}
                </DialogTitle>
                {modalTarefa?.workflows?.missoes && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Missão: {modalTarefa.workflows.missoes.titulo}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          {modalTarefa && (
            <div className="space-y-4 mt-2">
              {/* Meta */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                  {modalTarefa.status}
                </span>
                {modalTarefa.agentes_config && (
                  <span className="px-2 py-1 rounded-full bg-orange-50 text-orange-700 font-medium">
                    {modalTarefa.agentes_config.nome}
                  </span>
                )}
                <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                  Atualizado {timeAgo(modalTarefa.atualizado_em ?? modalTarefa.criado_em)}
                </span>
              </div>

              {/* Descrição */}
              {modalTarefa.descricao && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Descrição</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{modalTarefa.descricao}</p>
                </div>
              )}

              {/* Entregável */}
              {modalTarefa.entregaveis?.conteudo && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Entregável</p>
                  <ScrollArea className="max-h-80 border rounded-lg bg-slate-50 p-4">
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{modalTarefa.entregaveis.conteudo}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
