'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────
interface OrdemProducao {
  nome?: string;
  codigo?: string;
  descricaoProduto?: string;
  descricao?: string;
  status?: string;
  tipoOrdem?: string;
  tipo?: string;
  qtde?: number | string;
  quantidade?: number | string;
  dataHoraEntrega?: string;
  dataEntrega?: string;
  dataHoraInicialPlanejada?: string;
  prioridade?: number | string;
  nomeEmpresa?: string;
  empresa?: string;
}

// ── Helpers ───────────────────────────────────────────────────
function norm(op: OrdemProducao) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazoStr = op.dataHoraEntrega ?? op.dataEntrega ?? null;
  const prazo = prazoStr ? new Date(prazoStr) : null;
  const status = op.status ?? '—';
  const isEncerrada = ['Encerrada', 'Cancelada', 'Encerrado', 'Cancelado'].includes(status);
  const atrasada = prazo != null && prazo < hoje && !isEncerrada;
  const diasAtraso = atrasada && prazo ? Math.floor((hoje.getTime() - prazo.getTime()) / 86_400_000) : 0;
  return {
    ref: op.nome ?? op.codigo ?? '—',
    produto: op.descricaoProduto ?? op.descricao ?? '—',
    tipo: op.tipoOrdem ?? op.tipo ?? '—',
    status,
    qtde: op.qtde ?? op.quantidade ?? '—',
    prazo,
    prazoStr,
    prioridade: op.prioridade ?? 99,
    empresa: op.nomeEmpresa ?? op.empresa ?? '',
    atrasada,
    diasAtraso,
    isEncerrada,
  };
}

function statusCor(status: string, atrasada: boolean): { border: string; bg: string; badge: string } {
  if (atrasada) return { border: '#ef4444', bg: '#fef2f2', badge: 'bg-red-100 text-red-700' };
  const s = status.toLowerCase();
  if (s.includes('liberada') || s.includes('liberado')) return { border: '#3b82f6', bg: '#eff6ff', badge: 'bg-blue-100 text-blue-700' };
  if (s.includes('confirmada') || s.includes('confirmado')) return { border: '#22c55e', bg: '#f0fdf4', badge: 'bg-green-100 text-green-700' };
  if (s.includes('andamento')) return { border: '#f59e0b', bg: '#fffbeb', badge: 'bg-amber-100 text-amber-700' };
  return { border: '#94a3b8', bg: '#f8fafc', badge: 'bg-slate-100 text-slate-600' };
}

function formatPrazo(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function prioLabel(p: number | string): { label: string; cls: string } {
  const n = Number(p);
  if (n === 1 || String(p).toLowerCase() === 'alta') return { label: '● Alta', cls: 'text-red-600 font-bold' };
  if (n === 2 || String(p).toLowerCase() === 'normal') return { label: '● Normal', cls: 'text-amber-600' };
  return { label: '● Baixa', cls: 'text-slate-400' };
}

// ── Status card ───────────────────────────────────────────────
function StatCard({ label, count, cor, onClick, active }: {
  label: string; count: number; cor: string; onClick: () => void; active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all ${active ? 'shadow-md' : 'opacity-80 hover:opacity-100'}`}
      style={{ borderColor: active ? cor : 'transparent', backgroundColor: cor + '15' }}
    >
      <p className="text-2xl font-bold" style={{ color: cor }}>{count}</p>
      <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mt-0.5">{label}</p>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────
export function FabricaShell() {
  const [ordens, setOrdens] = useState<OrdemProducao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [agora, setAgora] = useState(new Date());
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'solda' | 'montagem' | 'atrasados'>('todos');

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/nomus/ordens');
      if (!res.ok) { setErro(`Nomus retornou ${res.status}`); return; }
      const data = await res.json();
      const lista = Array.isArray(data) ? data : (data.data ?? data.items ?? data.ordens ?? []);
      setOrdens(lista);
      setLastUpdate(new Date());
      setErro(null);
    } catch (e) {
      setErro('Falha na conexão com o Nomus ERP');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 60_000);
    return () => clearInterval(id);
  }, [fetch_]);

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const normadas = ordens
    .filter(op => !['Encerrada', 'Cancelada', 'Encerrado', 'Cancelado'].includes(op.status ?? ''))
    .map(norm)
    .sort((a, b) => {
      const pa = Number(a.prioridade) || 99;
      const pb = Number(b.prioridade) || 99;
      if (pa !== pb) return pa - pb;
      const da = a.prazo?.getTime() ?? Infinity;
      const db = b.prazo?.getTime() ?? Infinity;
      return da - db;
    });

  // Counts for stat cards
  const counts = {
    liberadas: normadas.filter(o => o.status.toLowerCase().includes('libera')).length,
    confirmadas: normadas.filter(o => o.status.toLowerCase().includes('confirma')).length,
    emAndamento: normadas.filter(o => o.status.toLowerCase().includes('andamento')).length,
    atrasadas: normadas.filter(o => o.atrasada).length,
  };

  // Apply filters
  let filtradas = normadas;
  if (filtroStatus) {
    filtradas = filtradas.filter(o => o.status.toLowerCase().includes(filtroStatus.toLowerCase()));
  }
  if (filtroTipo === 'solda') {
    filtradas = filtradas.filter(o => o.tipo.toLowerCase().includes('solda') || o.produto.toLowerCase().includes('solda'));
  } else if (filtroTipo === 'montagem') {
    filtradas = filtradas.filter(o => o.tipo.toLowerCase().includes('montagem') || o.produto.toLowerCase().includes('montagem'));
  } else if (filtroTipo === 'atrasados') {
    filtradas = filtradas.filter(o => o.atrasada);
  }

  const segsDesdeUpdate = lastUpdate ? Math.floor((agora.getTime() - lastUpdate.getTime()) / 1000) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .fab { font-family: 'DM Sans', system-ui, sans-serif; }
        .fab-title { font-family: 'Syne', sans-serif; }
        .fab-mono { font-family: 'JetBrains Mono', monospace; }
        .fab-scroll::-webkit-scrollbar { width: 5px; }
        .fab-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .fab-row:hover td { background: #f8fafc !important; }
        @keyframes fab-pulse { 0%,100%{opacity:1}50%{opacity:.4} }
        .fab-blink { animation: fab-pulse 1.5s ease-in-out infinite; }
      `}</style>

      <div className="fab flex flex-col h-full bg-[#f5f7fa]">

        {/* ── Header ── */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏭</span>
              <div>
                <h1 className="fab-title text-lg font-bold text-slate-900 uppercase tracking-wide leading-none">
                  Chão de Fábrica
                </h1>
                <p className="text-[11px] text-slate-500 mt-0.5">Live Universe · Ordens de Produção</p>
              </div>
              {!loading && (
                <span className="fab-mono text-[13px] font-bold bg-slate-900 text-white px-2.5 py-1 rounded-lg ml-2">
                  {normadas.length} OPs ativas
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              {segsDesdeUpdate !== null && (
                <p className="text-[11px] text-slate-400">
                  atualizado há{' '}
                  <span className={`font-semibold ${segsDesdeUpdate > 50 ? 'text-amber-500 fab-blink' : 'text-slate-600'}`}>
                    {segsDesdeUpdate}s
                  </span>
                </p>
              )}
              <button
                onClick={() => { setLoading(true); fetch_(); }}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <span className={loading ? 'inline-block animate-spin' : ''}>↻</span>
                Atualizar
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-6 py-4 space-y-4">

            {/* ── Stat cards ── */}
            <div className="flex gap-3">
              <StatCard label="Liberadas"    count={counts.liberadas}   cor="#3b82f6" active={filtroTipo==='todos' && filtroStatus==='libera'}    onClick={() => { setFiltroTipo('todos'); setFiltroStatus(filtroStatus==='libera' ? null : 'libera'); }} />
              <StatCard label="Confirmadas"  count={counts.confirmadas} cor="#22c55e" active={filtroTipo==='todos' && filtroStatus==='confirma'}   onClick={() => { setFiltroTipo('todos'); setFiltroStatus(filtroStatus==='confirma' ? null : 'confirma'); }} />
              <StatCard label="Em Andamento" count={counts.emAndamento} cor="#f59e0b" active={filtroTipo==='todos' && filtroStatus==='andamento'}  onClick={() => { setFiltroTipo('todos'); setFiltroStatus(filtroStatus==='andamento' ? null : 'andamento'); }} />
              <StatCard label="Atrasadas"    count={counts.atrasadas}   cor="#ef4444" active={filtroTipo==='atrasados'}                            onClick={() => { setFiltroTipo(filtroTipo==='atrasados' ? 'todos' : 'atrasados'); setFiltroStatus(null); }} />
            </div>

            {/* ── Filtros rápidos ── */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mr-1">Filtro:</span>
              {(['todos', 'solda', 'montagem', 'atrasados'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { setFiltroTipo(f); setFiltroStatus(null); }}
                  className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors capitalize ${
                    filtroTipo === f
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {f === 'atrasados' ? `⚠ Atrasados${counts.atrasadas > 0 ? ` (${counts.atrasadas})` : ''}` :
                   f === 'todos' ? 'Todos' :
                   f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-slate-400 fab-mono">
                {filtradas.length} de {normadas.length}
              </span>
            </div>
          </div>

          {/* ── Tabela ── */}
          <div className="flex-1 overflow-auto fab-scroll px-6 pb-6">
            {loading && (
              <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
                <span className="inline-block animate-spin text-xl">↻</span>
                <span className="text-sm">Consultando Nomus ERP…</span>
              </div>
            )}

            {!loading && erro && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-4xl">⚠️</p>
                <p className="text-sm font-semibold text-red-600">{erro}</p>
                <button onClick={fetch_} className="text-xs text-slate-500 underline">Tentar novamente</button>
              </div>
            )}

            {!loading && !erro && filtradas.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
                <p className="text-4xl">✅</p>
                <p className="text-sm">Nenhuma OP neste filtro.</p>
              </div>
            )}

            {!loading && !erro && filtradas.length > 0 && (
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="sticky top-0 z-10">
                    {['OP', 'Produto', 'Tipo', 'Status', 'Qtde', 'Prazo Entrega', 'Prioridade', 'Atraso'].map(col => (
                      <th key={col} className="bg-slate-100 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2 whitespace-nowrap first:pl-4 last:pr-4">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((op, i) => {
                    const cor = statusCor(op.status, op.atrasada);
                    const prio = prioLabel(op.prioridade);
                    return (
                      <tr
                        key={`${op.ref}-${i}`}
                        className="fab-row border-b border-slate-100"
                        style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa' }}
                      >
                        <td className="px-3 py-2.5 pl-0 whitespace-nowrap" style={{ borderLeft: `3px solid ${cor.border}` }}>
                          <span className="fab-mono text-[12px] font-bold text-slate-800 pl-3">{op.ref}</span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[220px]">
                          <span className="text-slate-700 font-medium line-clamp-1" title={op.produto}>{op.produto}</span>
                          {op.empresa && <p className="text-[10px] text-slate-400 truncate">{op.empresa}</p>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                            {op.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cor.badge}`}>
                              {op.atrasada ? 'ATRASADO' : op.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="fab-mono font-semibold text-slate-700">{op.qtde}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`fab-mono text-[12px] font-semibold ${op.atrasada ? 'text-red-600' : 'text-slate-700'}`}>
                            {formatPrazo(op.prazo)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`text-[11px] ${prio.cls}`}>{prio.label}</span>
                        </td>
                        <td className="px-3 py-2.5 pr-4 whitespace-nowrap">
                          {op.atrasada ? (
                            <span className="fab-mono text-[12px] font-bold text-red-600">
                              +{op.diasAtraso}d
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Mini-widget exportado para uso no Mission Control ─────────
export function FridayOPsWidget() {
  const [dados, setDados] = useState<{ ativas: number; atrasadas: number } | null>(null);

  useEffect(() => {
    fetch('/api/nomus/ordens')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const lista = Array.isArray(data) ? data : (data.data ?? data.items ?? data.ordens ?? []);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const ativas = lista.filter((o: OrdemProducao) =>
          !['Encerrada', 'Cancelada', 'Encerrado', 'Cancelado'].includes(o.status ?? ''));
        const atrasadas = ativas.filter((o: OrdemProducao) => {
          const p = o.dataHoraEntrega ?? o.dataEntrega;
          return p ? new Date(p) < hoje : false;
        });
        setDados({ ativas: ativas.length, atrasadas: atrasadas.length });
      })
      .catch(() => null);
  }, []);

  if (!dados) return null;

  return (
    <Link
      href="/admin/fabrica"
      className="block mt-1 text-[9px] font-semibold text-slate-500 hover:text-orange-600 transition-colors"
      onClick={e => e.stopPropagation()}
    >
      🏭 {dados.ativas} OPs
      {dados.atrasadas > 0 && (
        <span className="text-red-500 ml-1">· {dados.atrasadas} atrasadas ⚠</span>
      )}
    </Link>
  );
}
