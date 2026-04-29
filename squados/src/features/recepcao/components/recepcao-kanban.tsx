'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────
interface ItemValidado {
  codigo?: string;
  descricao?: string;
  qtd_pedida?: number;
  validado?: boolean;
}

interface Recepcao {
  id: string;
  etapa: 'conferencia' | 'recusa_nota' | 'entrada_nota';
  nf_numero: string;
  fornecedor: string;
  valor_total: number;
  pedido_compra_nomus: string | null;
  observacoes: string | null;
  resumo_friday: string | null;
  divergencias: string[];
  itens_validados: ItemValidado[];
  pc_encontrado: boolean | null;
  processado_por_friday: boolean;
  telegram_enviado: boolean;
  registrado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface NomusItem {
  idProduto: number;
  informacoesAdicionaisProduto?: string;
  quantidade: string;
  valorUnitario: string;
}

interface NomusDoc {
  id?: number | string;
  numeroNF?: string;
  numero?: string;
  razaoSocialFornecedor?: string;
  fornecedor?: string;
  dataEntrada?: string;
  data?: string;
  valorTotal?: number | string;
  valor?: number | string;
  idPessoa?: number;
  idEmpresa?: number;
  pessoa?: { id?: number; razaoSocial?: string };
  empresa?: { id?: number };
  itens?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface Props {
  initialData: Recepcao[];
}

// ── Constants ─────────────────────────────────────────────────
const COLUNAS = [
  {
    key: 'conferencia' as const,
    emoji: '🔍',
    label: 'Conferência',
    desc: 'Aguardando Friday validar no Nomus',
    cor: '#3b82f6',
    bg: '#eff6ff',
  },
  {
    key: 'recusa_nota' as const,
    emoji: '⚠️',
    label: 'Recusa da Nota',
    desc: 'Itens com divergência — requer ação',
    cor: '#ef4444',
    bg: '#fef2f2',
  },
  {
    key: 'entrada_nota' as const,
    emoji: '✅',
    label: 'Entrada da Nota',
    desc: 'Validado — dar entrada no Nomus',
    cor: '#22c55e',
    bg: '#f0fdf4',
  },
];

const COR_NOMUS = '#8b5cf6';
const BG_NOMUS = '#faf5ff';

// ── Helpers ───────────────────────────────────────────────────
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatValorNomus(v: number | string | undefined) {
  if (v === undefined || v === null) return '—';
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  if (isNaN(n)) return String(v);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataHoje() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function extractItensNomus(doc: NomusDoc): NomusItem[] {
  const raw = (doc.itens ?? []) as Array<Record<string, unknown>>;
  if (!raw.length) return [];
  return raw.map(it => ({
    idProduto: Number(it.idProduto ?? (it.produto as Record<string, unknown>)?.['id'] ?? 0),
    informacoesAdicionaisProduto: String(it.informacoesAdicionaisProduto ?? it.descricao ?? ''),
    quantidade: String(it.quantidade ?? 1),
    valorUnitario: String(it.valorUnitario ?? it.valor ?? 0),
  }));
}

// ── Card kanban ───────────────────────────────────────────────
function RecepcaoCard({
  r,
  corColuna,
  onBuscarNomus,
}: {
  r: Recepcao;
  corColuna: string;
  onBuscarNomus?: (nf: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderLeft: `3px solid ${corColuna}` }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">NF</span>
            <p className="text-[15px] font-bold text-slate-900 leading-tight">{r.nf_numero}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {r.processado_por_friday ? (
              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                ✓ Friday
              </span>
            ) : (
              <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full animate-pulse">
                ⏳ Aguardando
              </span>
            )}
            {r.telegram_enviado && (
              <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                📬 Notificado
              </span>
            )}
          </div>
        </div>

        <p className="text-[12px] font-semibold text-slate-700 truncate">{r.fornecedor}</p>
        <p className="text-[12px] text-emerald-700 font-bold mt-0.5">{formatValor(r.valor_total)}</p>

        {r.pedido_compra_nomus && (
          <p className="text-[11px] text-slate-500 mt-1">
            <span className="text-slate-400">PC:</span> {r.pedido_compra_nomus}
            {r.pc_encontrado === true && <span className="text-emerald-600 ml-1">✓</span>}
            {r.pc_encontrado === false && <span className="text-red-500 ml-1">✗</span>}
          </p>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-slate-400">{r.registrado_por_nome}</span>
          <span className="text-[10px] text-slate-400">{timeAgo(r.criado_em)}</span>
        </div>
      </div>

      {expanded && (
        <>
          {r.resumo_friday && (
            <div className="border-t border-slate-100 px-3 py-2.5 bg-slate-50">
              <p className="text-[11px] font-semibold text-slate-600 mb-1">Análise Friday</p>
              <p className="text-[11px] text-slate-700 leading-relaxed">{r.resumo_friday}</p>
              {r.divergencias?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {r.divergencias.map((d, i) => (
                    <p key={i} className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">⚠ {d}</p>
                  ))}
                </div>
              )}
              {r.itens_validados?.length > 0 && (
                <p className="text-[10px] text-emerald-700 mt-1.5">
                  {r.itens_validados.length} item(ns) conferido(s)
                </p>
              )}
            </div>
          )}

          {/* Atalho para buscar no Nomus — só em entrada_nota */}
          {r.etapa === 'entrada_nota' && onBuscarNomus && (
            <div
              className="border-t border-slate-100 px-3 py-2 bg-violet-50"
              onClick={e => e.stopPropagation()}
            >
              <Button
                size="sm"
                className="w-full text-[11px] bg-violet-600 hover:bg-violet-700 text-white h-7"
                onClick={() => onBuscarNomus(r.nf_numero)}
              >
                🔍 Dar Entrada no Nomus
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Card NF do Nomus ──────────────────────────────────────────
function NomusResultCard({
  doc,
  onConfirmar,
}: {
  doc: NomusDoc;
  onConfirmar: (d: NomusDoc) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const nf        = doc.numeroNF ?? doc.numero ?? String(doc.id ?? '—');
  const forn      = doc.razaoSocialFornecedor ?? doc.pessoa?.razaoSocial ?? doc.fornecedor ?? '—';
  const valor     = doc.valorTotal ?? doc.valor;
  const data      = doc.dataEntrada ?? doc.data ?? '';
  const status    = String(doc.status ?? doc.situacao ?? '');
  const obs       = String(doc.observacoes ?? doc.obs ?? '');
  const itens     = (doc.itens ?? []) as Array<Record<string, unknown>>;
  const idPessoa  = doc.idPessoa ?? doc.pessoa?.id;
  const idEmpresa = doc.idEmpresa ?? doc.empresa?.id;

  return (
    <div
      className="bg-white rounded-xl border border-violet-200 shadow-sm overflow-hidden"
      style={{ borderLeft: `3px solid ${COR_NOMUS}` }}
    >
      {/* Cabeçalho clicável */}
      <div
        className="px-3 pt-3 pb-2 cursor-pointer hover:bg-violet-50/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wide">NF Nomus</span>
            <p className="text-[15px] font-bold text-slate-900 leading-tight">{nf}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
              ✓ Nomus
            </span>
            {status && (
              <span className="text-[9px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {status}
              </span>
            )}
          </div>
        </div>

        <p className="text-[12px] font-semibold text-slate-700 truncate">{forn}</p>

        <div className="flex items-center justify-between mt-1 gap-2">
          {valor !== undefined && (
            <p className="text-[12px] text-emerald-700 font-bold">{formatValorNomus(valor)}</p>
          )}
          {data && <p className="text-[10px] text-slate-400">{data}</p>}
        </div>

        {/* Linha resumida de itens */}
        {itens.length > 0 && (
          <p className="text-[10px] text-slate-500 mt-1">
            {itens.length} item(ns) · {expanded ? 'ocultar ▲' : 'ver detalhes ▼'}
          </p>
        )}
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div className="border-t border-violet-100 px-3 py-2.5 bg-violet-50/50 space-y-2">
          {/* Campos Nomus */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {idPessoa !== undefined && (
              <p className="text-[10px] text-slate-500">
                <span className="text-slate-400">ID Pessoa:</span> {String(idPessoa)}
              </p>
            )}
            {idEmpresa !== undefined && (
              <p className="text-[10px] text-slate-500">
                <span className="text-slate-400">ID Empresa:</span> {String(idEmpresa)}
              </p>
            )}
            {doc.idTipoMovimentacao !== undefined && (
              <p className="text-[10px] text-slate-500">
                <span className="text-slate-400">Tipo Movim.:</span> {String(doc.idTipoMovimentacao)}
              </p>
            )}
            {doc.idSetorEntrada !== undefined && (
              <p className="text-[10px] text-slate-500">
                <span className="text-slate-400">Setor Entrada:</span> {String(doc.idSetorEntrada)}
              </p>
            )}
            {doc.idSetorSaida !== undefined && (
              <p className="text-[10px] text-slate-500">
                <span className="text-slate-400">Setor Saída:</span> {String(doc.idSetorSaida)}
              </p>
            )}
          </div>

          {/* Observações */}
          {obs && (
            <p className="text-[10px] text-slate-600 italic border-t border-violet-100 pt-1.5">{obs}</p>
          )}

          {/* Itens */}
          {itens.length > 0 && (
            <div className="border-t border-violet-100 pt-1.5">
              <p className="text-[10px] font-bold text-slate-500 mb-1">Itens</p>
              <div className="space-y-1">
                {itens.map((it, i) => {
                  const cod  = String(it.codigoProduto ?? it.codigo ?? it.idProduto ?? i + 1);
                  const desc = String(it.descricaoProduto ?? it.descricao ?? it.informacoesAdicionaisProduto ?? '—');
                  const qtd  = String(it.quantidade ?? '—');
                  const vUn  = it.valorUnitario !== undefined ? formatValorNomus(it.valorUnitario as string) : null;
                  return (
                    <div key={i} className="flex items-start gap-2 text-[10px] text-slate-600 bg-white rounded px-2 py-1">
                      <span className="text-violet-400 font-bold shrink-0">{cod}</span>
                      <span className="flex-1 truncate">{desc}</span>
                      <span className="shrink-0 text-slate-500">×{qtd}</span>
                      {vUn && <span className="shrink-0 text-emerald-700 font-semibold">{vUn}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ação */}
      <div className="border-t border-violet-100 px-3 py-2 bg-violet-50">
        <Button
          size="sm"
          className="w-full text-[11px] bg-violet-600 hover:bg-violet-700 text-white h-8 font-semibold"
          onClick={() => onConfirmar(doc)}
        >
          ✓ Dar Entrada — Movimentar Estoque e Financeiro
        </Button>
      </div>
    </div>
  );
}

// ── Modal nova recepção ───────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function NovaRecepcaoModal({ open, onClose, onSuccess }: ModalProps) {
  const [loading, setLoading] = useState(false);
  const [nomusPreview, setNomusPreview] = useState<string | null>(null);
  const [checkingNomus, setCheckingNomus] = useState(false);

  const [form, setForm] = useState({
    nf_numero: '',
    fornecedor: '',
    valor_total: '',
    pedido_compra_nomus: '',
    observacoes: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleVerificarNomus = async () => {
    if (!form.nf_numero.trim()) return;
    setCheckingNomus(true);
    setNomusPreview(null);
    try {
      const res = await fetch(`/api/nomus/documentosEntrada?numeroNF=${encodeURIComponent(form.nf_numero.trim())}`);
      if (!res.ok) { setNomusPreview('NF não encontrada no Nomus'); return; }
      const data = await res.json();
      const lista = Array.isArray(data) ? data : (data.data ?? data.items ?? [data]);
      if (!lista.length || !lista[0]) { setNomusPreview('NF não localizada no Nomus'); return; }
      const doc = lista[0] as Record<string, unknown>;
      setNomusPreview(
        `✅ Encontrada: NF ${form.nf_numero} — ${doc.razaoSocialFornecedor ?? doc.fornecedor ?? '—'}`
      );
      const forn = String(doc.razaoSocialFornecedor ?? doc.fornecedor ?? '');
      if (forn && !form.fornecedor) set('fornecedor', forn);
      const val = doc.valorTotal ?? doc.valor;
      if (val && !form.valor_total) set('valor_total', String(val));
    } catch {
      setNomusPreview('Erro ao consultar Nomus');
    } finally {
      setCheckingNomus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nf_numero.trim() || !form.fornecedor.trim() || !form.valor_total) return;
    setLoading(true);
    try {
      const res = await fetch('/api/operacoes/recepcao-materia-prima', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nf_numero: form.nf_numero.trim(),
          fornecedor: form.fornecedor.trim(),
          valor_total: parseFloat(form.valor_total.replace(',', '.')),
          pedido_compra_nomus: form.pedido_compra_nomus.trim() || null,
          observacoes: form.observacoes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro desconhecido');
      toast.success('Recepção registrada! Friday processará em breve.');
      setForm({ nf_numero: '', fornecedor: '', valor_total: '', pedido_compra_nomus: '', observacoes: '' });
      setNomusPreview(null);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            Confirmar Recepção de Mercadoria
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Friday validará o PC no Nomus e notificará o resultado.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="nf">Número da NF *</Label>
            <div className="flex gap-2">
              <Input
                id="nf"
                placeholder="ex: 001234"
                value={form.nf_numero}
                onChange={e => { set('nf_numero', e.target.value); setNomusPreview(null); }}
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleVerificarNomus}
                disabled={!form.nf_numero.trim() || checkingNomus}
                className="shrink-0 text-xs"
              >
                {checkingNomus ? '…' : '🔍 Buscar no Nomus'}
              </Button>
            </div>
            {nomusPreview && (
              <p className={`text-[11px] px-2 py-1.5 rounded ${nomusPreview.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {nomusPreview}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forn">Fornecedor *</Label>
            <Input id="forn" placeholder="Nome do fornecedor" value={form.fornecedor} onChange={e => set('fornecedor', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor Total R$ *</Label>
              <Input id="valor" type="number" placeholder="0,00" step="0.01" min="0.01" value={form.valor_total} onChange={e => set('valor_total', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc">Pedido de Compra Nomus</Label>
              <Input id="pc" placeholder="ex: PC000021" value={form.pedido_compra_nomus} onChange={e => set('pedido_compra_nomus', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" placeholder="Anotações sobre a recepção (opcional)" rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? 'Registrando…' : '✓ Confirmar Recepção'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal confirmar entrada no Nomus ──────────────────────────
interface ConfirmarProps {
  doc: NomusDoc | null;
  onClose: () => void;
}

function NomusConfirmarModal({ doc, onClose }: ConfirmarProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    idEmpresa: '1',
    idTipoMovimentacao: '',
    idPessoa: '',
    idSetorEntrada: '',
    idSetorSaida: '',
    dataEntrada: dataHoje(),
    observacoes: '',
    itensJson: '',
  });

  useEffect(() => {
    if (!doc) return;
    const idEmpresa = String(doc.idEmpresa ?? doc.empresa?.id ?? 1);
    const idPessoa = String(doc.idPessoa ?? doc.pessoa?.id ?? '');
    const itens = extractItensNomus(doc);
    setForm(f => ({
      ...f,
      idEmpresa,
      idPessoa,
      dataEntrada: doc.dataEntrada ?? dataHoje(),
      observacoes: String(doc.observacoes ?? ''),
      itensJson: itens.length
        ? JSON.stringify(itens, null, 2)
        : JSON.stringify([{ idProduto: 0, informacoesAdicionaisProduto: '', quantidade: '1.00', valorUnitario: '0' }], null, 2),
    }));
  }, [doc]);

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  if (!doc) return null;

  const nf = doc.numeroNF ?? doc.numero ?? String(doc.id ?? '');
  const forn = doc.razaoSocialFornecedor ?? doc.pessoa?.razaoSocial ?? doc.fornecedor ?? '—';
  const valor = doc.valorTotal ?? doc.valor;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.idTipoMovimentacao || !form.idPessoa || !form.idSetorEntrada) {
      toast.error('Preencha idTipoMovimentacao, idPessoa e idSetorEntrada');
      return;
    }
    let itens: unknown[];
    try {
      itens = JSON.parse(form.itensJson);
      if (!Array.isArray(itens)) throw new Error();
    } catch {
      toast.error('JSON de itens inválido');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        idEmpresa: Number(form.idEmpresa),
        idTipoMovimentacao: Number(form.idTipoMovimentacao),
        idPessoa: Number(form.idPessoa),
        idSetorEntrada: Number(form.idSetorEntrada),
        ...(form.idSetorSaida ? { idSetorSaida: Number(form.idSetorSaida) } : {}),
        dataEntrada: form.dataEntrada,
        ...(form.observacoes ? { observacoes: form.observacoes } : {}),
        itens,
      };
      const res = await fetch('/api/nomus/documentosEntrada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.detalhe ?? `Erro ${res.status}`);
      toast.success(`NF ${nf} registrada! Estoque e financeiro movimentados no Nomus.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar no Nomus');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            Confirmar Entrada — NF {nf}
          </DialogTitle>
          <div className="mt-1 px-3 py-2 bg-violet-50 rounded-lg">
            <p className="text-[12px] font-semibold text-slate-700">{forn}</p>
            {valor !== undefined && (
              <p className="text-[13px] font-bold text-emerald-700 mt-0.5">{formatValorNomus(valor)}</p>
            )}
            <p className="text-[10px] text-slate-400 mt-0.5">
              Esta ação insere o documento no Nomus e movimenta estoque e financeiro automaticamente.
            </p>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Linha 1 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="idEmpresa">ID Empresa *</Label>
              <Input id="idEmpresa" type="number" value={form.idEmpresa} onChange={e => set('idEmpresa', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idTipoMov">ID Tipo Movim. *</Label>
              <Input id="idTipoMov" type="number" placeholder="ex: 3" value={form.idTipoMovimentacao} onChange={e => set('idTipoMovimentacao', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idPessoa">ID Pessoa *</Label>
              <Input id="idPessoa" type="number" placeholder="ex: 42" value={form.idPessoa} onChange={e => set('idPessoa', e.target.value)} required />
            </div>
          </div>

          {/* Linha 2 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="idSetorE">ID Setor Entrada *</Label>
              <Input id="idSetorE" type="number" placeholder="ex: 1" value={form.idSetorEntrada} onChange={e => set('idSetorEntrada', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idSetorS">ID Setor Saída</Label>
              <Input id="idSetorS" type="number" placeholder="ex: 1" value={form.idSetorSaida} onChange={e => set('idSetorSaida', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataEntrada">Data Entrada *</Label>
              <Input id="dataEntrada" placeholder="DD/MM/AAAA" value={form.dataEntrada} onChange={e => set('dataEntrada', e.target.value)} required />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="obsNomus">Observações</Label>
            <Input id="obsNomus" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </div>

          {/* Itens */}
          <div className="space-y-1.5">
            <Label htmlFor="itensJson">
              Itens (JSON)
              <span className="text-[10px] text-slate-400 ml-2 font-normal">verifique o idProduto de cada item</span>
            </Label>
            <Textarea id="itensJson" rows={7} className="font-mono text-[11px]" value={form.itensJson} onChange={e => set('itensJson', e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white">
              {loading ? 'Registrando no Nomus…' : '✓ Confirmar Entrada'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────
export function RecepcaoKanban({ initialData }: Props) {
  const [recepcoes, setRecepcoes] = useState<Recepcao[]>(initialData);
  const [modalAberto, setModalAberto] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // 4ª coluna — notas Nomus integradas
  const [nomusTodos, setNomusTodos] = useState<NomusDoc[]>([]);
  const [nomusFiltro, setNomusFiltro] = useState('');
  const [nomusBuscando, setNomusBuscando] = useState(false);
  const [nomusParaConfirmar, setNomusParaConfirmar] = useState<NomusDoc | null>(null);
  const [nomusErro, setNomusErro] = useState<string | null>(null);

  // Filtra client-side pelo texto digitado
  const nomusVisiveis = nomusFiltro.trim()
    ? nomusTodos.filter(d => {
        const q = nomusFiltro.toLowerCase();
        return (
          (d.numeroNF ?? d.numero ?? '').toLowerCase().includes(q) ||
          (d.razaoSocialFornecedor ?? d.fornecedor ?? '').toLowerCase().includes(q)
        );
      })
    : nomusTodos;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/operacoes/recepcao-materia-prima');
      if (!res.ok) return;
      const data = await res.json();
      setRecepcoes(data.recepcoes ?? []);
      setLastUpdate(new Date());
    } catch { /* silent */ }
  }, []);

  const fetchNomusDocs = useCallback(async () => {
    setNomusBuscando(true);
    setNomusErro(null);
    try {
      // Nomus exige filtro — tenta intervalo do mês atual
      const hoje = new Date();
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const params = new URLSearchParams({
        dataEntradaInicio: fmt(inicio),
        dataEntradaFim: fmt(hoje),
      });

      const res = await fetch(`/api/nomus/documentosEntrada?${params}`);
      if (!res.ok) {
        // Endpoint pode não suportar esse filtro — deixa lista vazia (modo busca)
        setNomusTodos([]);
        return;
      }
      const data = await res.json();
      const lista: NomusDoc[] = Array.isArray(data)
        ? data
        : (data.data ?? data.items ?? data.content ?? (data.id || data.numeroNF ? [data] : []));
      setNomusTodos(lista);
    } catch {
      setNomusErro('Erro de conexão com o Nomus');
    } finally {
      setNomusBuscando(false);
    }
  }, []);

  // Busca específica por NF (para atalho dos cards e busca manual)
  const buscarNFNomus = useCallback(async (nf: string) => {
    if (!nf.trim()) return;
    setNomusFiltro(nf);
    // Se já temos na lista local, só filtra. Senão busca no Nomus.
    const jaTemLocal = nomusTodos.some(d =>
      (d.numeroNF ?? d.numero ?? '') === nf.trim()
    );
    if (jaTemLocal) return;

    setNomusBuscando(true);
    setNomusErro(null);
    try {
      const res = await fetch(`/api/nomus/documentosEntrada?numeroNF=${encodeURIComponent(nf.trim())}`);
      if (!res.ok) return;
      const data = await res.json();
      const lista: NomusDoc[] = Array.isArray(data)
        ? data
        : (data.data ?? data.items ?? (data.id || data.numeroNF ? [data] : []));
      if (lista.length) {
        setNomusTodos(prev => {
          const ids = new Set(prev.map(d => String(d.id ?? d.numeroNF ?? d.numero)));
          const novos = lista.filter(d => !ids.has(String(d.id ?? d.numeroNF ?? d.numero)));
          return [...novos, ...prev];
        });
      }
    } catch { /* silent */ } finally {
      setNomusBuscando(false);
    }
  }, [nomusTodos]);

  const handleBuscarDoCard = useCallback((nf: string) => {
    buscarNFNomus(nf);
  }, [buscarNFNomus]);

  // Polling recepcoes 30s + carga inicial Nomus
  useEffect(() => {
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    fetchNomusDocs();
    const id = setInterval(fetchNomusDocs, 60_000);
    return () => clearInterval(id);
  }, [fetchNomusDocs]);

  const pendentes = recepcoes.filter(r => !r.processado_por_friday).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700&display=swap');
        .rc { font-family: 'DM Sans', system-ui, sans-serif; }
        .rc-title { font-family: 'Syne', sans-serif; }
        .rc-scroll::-webkit-scrollbar { width: 4px; }
        .rc-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
      `}</style>

      <div className="rc flex flex-col h-full bg-[#f5f7fa]">
        {/* Header */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <h1 className="rc-title text-lg font-bold text-slate-900 uppercase tracking-wide leading-none">
                Recepção de Mercadorias
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5">Friday valida automaticamente no Nomus ERP</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {pendentes > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[11px] font-semibold text-amber-700">
                  {pendentes} aguardando Friday
                </span>
              </div>
            )}
            <span className="text-[10px] text-slate-400">
              Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Button
              onClick={() => setModalAberto(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold gap-1.5"
            >
              <span className="text-base">+</span>
              Nova Recepção
            </Button>
          </div>
        </header>

        {/* Kanban 4 colunas */}
        <div className="flex-1 flex gap-0 overflow-hidden">
          {/* 3 colunas Supabase */}
          {COLUNAS.map((col) => {
            const cards = recepcoes.filter(r => r.etapa === col.key);
            return (
              <div
                key={col.key}
                className="flex-1 flex flex-col border-r border-slate-200 min-w-0"
                style={{ backgroundColor: col.bg }}
              >
                <div
                  className="flex-shrink-0 px-4 py-3 flex items-center gap-2 border-b"
                  style={{ borderBottomColor: col.cor + '40' }}
                >
                  <span className="text-lg">{col.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-wide text-slate-700">{col.label}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: col.cor }}>
                        {cards.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{col.desc}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto rc-scroll px-3 py-3 space-y-2.5">
                  {cards.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-2xl mb-2 opacity-40">{col.emoji}</p>
                      <p className="text-[11px] text-slate-400">Nenhuma NF nesta etapa</p>
                    </div>
                  )}
                  {cards.map(r => (
                    <RecepcaoCard
                      key={r.id}
                      r={r}
                      corColuna={col.cor}
                      onBuscarNomus={col.key === 'entrada_nota' ? handleBuscarDoCard : undefined}
                    />
                  ))}
                </div>

                {cards.length > 0 && (
                  <div className="flex-shrink-0 px-4 py-2 border-t border-slate-200 bg-white">
                    <p className="text-[11px] text-slate-500 text-right">
                      Total: <span className="font-bold text-slate-700">
                        {formatValor(cards.reduce((sum, r) => sum + r.valor_total, 0))}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* 4ª coluna: Notas Fiscais de Entrada — integradas do Nomus */}
          <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: BG_NOMUS }}>
            {/* Header */}
            <div
              className="flex-shrink-0 px-4 py-3 flex items-center gap-2 border-b"
              style={{ borderBottomColor: COR_NOMUS + '40' }}
            >
              <span className="text-lg">📋</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-wide text-slate-700">
                    Notas Fiscais de Entrada
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: COR_NOMUS }}
                  >
                    {nomusVisiveis.length}
                  </span>
                  {nomusBuscando && (
                    <span className="text-[9px] text-violet-400 animate-pulse">carregando…</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">Nomus ERP — atualiza a cada 60s</p>
              </div>
              <button
                onClick={fetchNomusDocs}
                className="text-[13px] text-violet-400 hover:text-violet-600 transition-colors shrink-0"
                title="Recarregar"
              >
                ↻
              </button>
            </div>

            {/* Busca / filtro */}
            <div className="flex-shrink-0 px-3 pt-2.5 pb-2 border-b border-violet-100 flex gap-2">
              <Input
                placeholder="Número da NF ou fornecedor…"
                value={nomusFiltro}
                onChange={e => setNomusFiltro(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarNFNomus(nomusFiltro)}
                className="flex-1 text-[12px] border-violet-200 focus-visible:ring-violet-400 h-8"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => buscarNFNomus(nomusFiltro)}
                disabled={!nomusFiltro.trim() || nomusBuscando}
                className="shrink-0 h-8 px-2 border-violet-200 text-violet-600 hover:bg-violet-50"
              >
                🔍
              </Button>
            </div>

            {/* Lista de NFs do Nomus */}
            <div className="flex-1 overflow-y-auto rc-scroll px-3 py-3 space-y-2.5">
              {nomusErro && (
                <div className="text-center py-6 px-2">
                  <p className="text-[11px] text-slate-500 bg-white border border-red-100 rounded-lg px-3 py-3">
                    ⚠ {nomusErro}
                  </p>
                  <button onClick={fetchNomusDocs} className="text-[10px] text-violet-500 underline mt-2">
                    Tentar novamente
                  </button>
                </div>
              )}

              {!nomusErro && !nomusBuscando && nomusTodos.length === 0 && (
                <div className="text-center py-12 px-3">
                  <p className="text-3xl mb-3 opacity-30">🔍</p>
                  <p className="text-[12px] font-semibold text-slate-500 mb-1">Busque pelo número da NF</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Digite o número no campo acima e pressione Enter.<br />
                    Ou clique em &ldquo;Dar Entrada no Nomus&rdquo; em qualquer card validado.
                  </p>
                </div>
              )}

              {!nomusErro && nomusTodos.length > 0 && nomusVisiveis.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-[11px] text-slate-400">Nenhuma NF corresponde ao filtro</p>
                </div>
              )}

              {nomusVisiveis.map((doc, i) => (
                <NomusResultCard
                  key={doc.id ?? i}
                  doc={doc}
                  onConfirmar={setNomusParaConfirmar}
                />
              ))}
            </div>

            {nomusTodos.length > 0 && (
              <div className="flex-shrink-0 px-4 py-2 border-t border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500 text-right">
                  {nomusTodos.length} nota(s) no Nomus
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <NovaRecepcaoModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onSuccess={refresh}
      />

      <NomusConfirmarModal
        doc={nomusParaConfirmar}
        onClose={() => setNomusParaConfirmar(null)}
      />
    </>
  );
}
