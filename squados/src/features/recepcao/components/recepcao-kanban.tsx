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
    desc: 'Validado — criar documento no Nomus',
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

// ── Card component ────────────────────────────────────────────
function RecepcaoCard({
  r,
  corColuna,
  onInserirNomus,
}: {
  r: Recepcao;
  corColuna: string;
  onInserirNomus?: (r: Recepcao) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderLeft: `3px solid ${corColuna}` }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-3 pt-3 pb-2">
        {/* NF + status */}
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

        {/* Fornecedor + valor */}
        <p className="text-[12px] font-semibold text-slate-700 truncate">{r.fornecedor}</p>
        <p className="text-[12px] text-emerald-700 font-bold mt-0.5">{formatValor(r.valor_total)}</p>

        {/* PC */}
        {r.pedido_compra_nomus && (
          <p className="text-[11px] text-slate-500 mt-1">
            <span className="text-slate-400">PC:</span> {r.pedido_compra_nomus}
            {r.pc_encontrado === true && <span className="text-emerald-600 ml-1">✓</span>}
            {r.pc_encontrado === false && <span className="text-red-500 ml-1">✗</span>}
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-slate-400">{r.registrado_por_nome}</span>
          <span className="text-[10px] text-slate-400">{timeAgo(r.criado_em)}</span>
        </div>
      </div>

      {/* Expanded: resultado friday */}
      {expanded && (
        <>
          {r.resumo_friday && (
            <div className="border-t border-slate-100 px-3 py-2.5 bg-slate-50">
              <p className="text-[11px] font-semibold text-slate-600 mb-1">Análise Friday</p>
              <p className="text-[11px] text-slate-700 leading-relaxed">{r.resumo_friday}</p>
              {r.divergencias && r.divergencias.length > 0 && (
                <div className="mt-2 space-y-1">
                  {r.divergencias.map((d, i) => (
                    <p key={i} className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1">⚠ {d}</p>
                  ))}
                </div>
              )}
              {r.itens_validados && r.itens_validados.length > 0 && (
                <p className="text-[10px] text-emerald-700 mt-1.5">
                  {r.itens_validados.length} item(ns) conferido(s)
                </p>
              )}
            </div>
          )}

          {/* Botão Inserir no Nomus — só na coluna entrada_nota */}
          {r.etapa === 'entrada_nota' && onInserirNomus && (
            <div
              className="border-t border-slate-100 px-3 py-2 bg-violet-50"
              onClick={e => e.stopPropagation()}
            >
              <Button
                size="sm"
                className="w-full text-[11px] bg-violet-600 hover:bg-violet-700 text-white h-7"
                onClick={() => onInserirNomus(r)}
              >
                📋 Inserir no Nomus
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Nomus Doc Card ────────────────────────────────────────────
function NomusDocCard({ doc }: { doc: NomusDoc }) {
  const nf = doc.numeroNF ?? doc.numero ?? String(doc.id ?? '—');
  const forn = doc.razaoSocialFornecedor ?? doc.fornecedor ?? '—';
  const data = doc.dataEntrada ?? doc.data ?? '';
  const valor = doc.valorTotal ?? doc.valor;
  return (
    <div
      className="bg-white rounded-xl border border-violet-100 shadow-sm overflow-hidden"
      style={{ borderLeft: `3px solid ${COR_NOMUS}` }}
    >
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <span className="text-[11px] font-bold text-violet-400 uppercase tracking-wide">NF Nomus</span>
            <p className="text-[14px] font-bold text-slate-900 leading-tight">{nf}</p>
          </div>
          <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full shrink-0">
            ✓ Registrada
          </span>
        </div>
        <p className="text-[12px] font-semibold text-slate-700 truncate">{forn}</p>
        {valor !== undefined && (
          <p className="text-[12px] text-emerald-700 font-bold mt-0.5">{formatValorNomus(valor)}</p>
        )}
        {data && (
          <p className="text-[10px] text-slate-400 mt-1">{data}</p>
        )}
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
      if (!res.ok) {
        setNomusPreview('NF não encontrada no Nomus (ou endpoint indisponível)');
        return;
      }
      const data = await res.json();
      const lista = Array.isArray(data) ? data : (data.data ?? data.items ?? [data]);
      if (lista.length === 0 || (lista.length === 1 && !lista[0])) {
        setNomusPreview('NF não localizada no Nomus');
      } else {
        const doc = lista[0] as Record<string, unknown>;
        setNomusPreview(
          `✅ Encontrada: ${doc.descricao ?? doc.numeroNF ?? form.nf_numero} — Fornecedor: ${doc.fornecedor ?? doc.razaoSocialFornecedor ?? '—'}`
        );
        if ((doc.fornecedor || doc.razaoSocialFornecedor) && !form.fornecedor) {
          set('fornecedor', String(doc.fornecedor ?? doc.razaoSocialFornecedor ?? ''));
        }
        if ((doc.valorTotal || doc.valor) && !form.valor_total) {
          set('valor_total', String(doc.valorTotal ?? doc.valor ?? ''));
        }
      }
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
          {/* NF */}
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

          {/* Fornecedor */}
          <div className="space-y-1.5">
            <Label htmlFor="forn">Fornecedor *</Label>
            <Input
              id="forn"
              placeholder="Nome do fornecedor"
              value={form.fornecedor}
              onChange={e => set('fornecedor', e.target.value)}
              required
            />
          </div>

          {/* Valor + PC lado a lado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor Total R$ *</Label>
              <Input
                id="valor"
                type="number"
                placeholder="0,00"
                step="0.01"
                min="0.01"
                value={form.valor_total}
                onChange={e => set('valor_total', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc">Pedido de Compra Nomus</Label>
              <Input
                id="pc"
                placeholder="ex: PC000021"
                value={form.pedido_compra_nomus}
                onChange={e => set('pedido_compra_nomus', e.target.value)}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              placeholder="Anotações sobre a recepção (opcional)"
              rows={2}
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? 'Registrando…' : '✓ Confirmar Recepção'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal Inserir NF no Nomus ─────────────────────────────────
interface NomusInserirProps {
  recepcao: Recepcao | null;
  onClose: () => void;
  onSuccess: () => void;
}

function buildItensNomus(itens: ItemValidado[]): string {
  if (!itens || itens.length === 0) {
    return JSON.stringify(
      [{ idProduto: 0, informacoesAdicionaisProduto: '', quantidade: '1.00', valorUnitario: '0' }],
      null,
      2
    );
  }
  return JSON.stringify(
    itens.map(it => ({
      idProduto: 0,
      informacoesAdicionaisProduto: `${it.codigo ?? ''} - ${it.descricao ?? ''}`.trim().replace(/^-\s*/, ''),
      quantidade: String(it.qtd_pedida ?? 1) + '.00',
      valorUnitario: '0',
    })),
    null,
    2
  );
}

function NomusInserirModal({ recepcao, onClose, onSuccess }: NomusInserirProps) {
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
    if (recepcao) {
      setForm(f => ({
        ...f,
        observacoes: recepcao.observacoes ?? recepcao.nf_numero,
        dataEntrada: dataHoje(),
        itensJson: buildItensNomus(recepcao.itens_validados ?? []),
      }));
    }
  }, [recepcao]);

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.idTipoMovimentacao || !form.idPessoa || !form.idSetorEntrada) {
      toast.error('Preencha os campos obrigatórios do Nomus');
      return;
    }

    let itens: unknown[];
    try {
      itens = JSON.parse(form.itensJson);
      if (!Array.isArray(itens)) throw new Error('itens deve ser um array');
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
        idSetorSaida: form.idSetorSaida ? Number(form.idSetorSaida) : undefined,
        dataEntrada: form.dataEntrada,
        observacoes: form.observacoes || undefined,
        itens,
      };

      const res = await fetch('/api/nomus/documentosEntrada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? data.detalhe ?? 'Erro no Nomus');

      toast.success('NF inserida com sucesso no Nomus!');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao inserir no Nomus');
    } finally {
      setLoading(false);
    }
  };

  if (!recepcao) return null;

  return (
    <Dialog open={!!recepcao} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            Inserir NF {recepcao.nf_numero} no Nomus
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Fornecedor: <strong>{recepcao.fornecedor}</strong> — Valor: <strong>{formatValor(recepcao.valor_total)}</strong>
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* IDs Nomus — linha 1 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="idEmpresa">ID Empresa *</Label>
              <Input
                id="idEmpresa"
                type="number"
                placeholder="1"
                value={form.idEmpresa}
                onChange={e => set('idEmpresa', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idTipoMov">ID Tipo Movimentação *</Label>
              <Input
                id="idTipoMov"
                type="number"
                placeholder="ex: 3"
                value={form.idTipoMovimentacao}
                onChange={e => set('idTipoMovimentacao', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idPessoa">ID Pessoa (Fornecedor) *</Label>
              <Input
                id="idPessoa"
                type="number"
                placeholder="ex: 42"
                value={form.idPessoa}
                onChange={e => set('idPessoa', e.target.value)}
                required
              />
            </div>
          </div>

          {/* IDs Nomus — linha 2 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="idSetorE">ID Setor Entrada *</Label>
              <Input
                id="idSetorE"
                type="number"
                placeholder="ex: 1"
                value={form.idSetorEntrada}
                onChange={e => set('idSetorEntrada', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idSetorS">ID Setor Saída</Label>
              <Input
                id="idSetorS"
                type="number"
                placeholder="ex: 1"
                value={form.idSetorSaida}
                onChange={e => set('idSetorSaida', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataEntrada">Data de Entrada *</Label>
              <Input
                id="dataEntrada"
                placeholder="DD/MM/AAAA"
                value={form.dataEntrada}
                onChange={e => set('dataEntrada', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="obsNomus">Observações</Label>
            <Input
              id="obsNomus"
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
            />
          </div>

          {/* Itens JSON */}
          <div className="space-y-1.5">
            <Label htmlFor="itensJson">
              Itens (JSON) *
              <span className="text-[10px] text-slate-400 ml-2 font-normal">
                Preencha idProduto com o ID do Nomus para cada item
              </span>
            </Label>
            <Textarea
              id="itensJson"
              rows={8}
              className="font-mono text-[11px]"
              value={form.itensJson}
              onChange={e => set('itensJson', e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white">
              {loading ? 'Enviando ao Nomus…' : '📋 Inserir no Nomus'}
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
  const [recepcaoParaNomus, setRecepcaoParaNomus] = useState<Recepcao | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [nomusDocs, setNomusDocs] = useState<NomusDoc[]>([]);
  const [nomusLoading, setNomusLoading] = useState(false);

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
    setNomusLoading(true);
    try {
      const res = await fetch('/api/nomus/documentosEntrada');
      if (!res.ok) return;
      const data = await res.json();
      const lista: NomusDoc[] = Array.isArray(data)
        ? data
        : (data.data ?? data.items ?? data.content ?? []);
      setNomusDocs(lista.slice(0, 30));
    } catch { /* silent */ } finally {
      setNomusLoading(false);
    }
  }, []);

  // Polling recepcoes 30s
  useEffect(() => {
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  // Polling Nomus docs 60s
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
                {/* Coluna header */}
                <div
                  className="flex-shrink-0 px-4 py-3 flex items-center gap-2 border-b"
                  style={{ borderBottomColor: col.cor + '40' }}
                >
                  <span className="text-lg">{col.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-wide text-slate-700">{col.label}</span>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                        style={{ backgroundColor: col.cor }}
                      >
                        {cards.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{col.desc}</p>
                  </div>
                </div>

                {/* Cards */}
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
                      onInserirNomus={col.key === 'entrada_nota' ? setRecepcaoParaNomus : undefined}
                    />
                  ))}
                </div>

                {/* Coluna footer: total valor */}
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

          {/* 4ª coluna: Notas Fiscais de Entrada (Nomus) */}
          <div
            className="flex-1 flex flex-col min-w-0"
            style={{ backgroundColor: BG_NOMUS }}
          >
            {/* Coluna header */}
            <div
              className="flex-shrink-0 px-4 py-3 flex items-center gap-2 border-b"
              style={{ borderBottomColor: COR_NOMUS + '40' }}
            >
              <span className="text-lg">📋</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-wide text-slate-700">
                    NF de Entrada
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: COR_NOMUS }}
                  >
                    {nomusDocs.length}
                  </span>
                  {nomusLoading && (
                    <span className="text-[9px] text-violet-400 animate-pulse">atualizando…</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">Documentos registrados no Nomus ERP</p>
              </div>
              <button
                onClick={fetchNomusDocs}
                className="text-[10px] text-violet-400 hover:text-violet-600 transition-colors shrink-0"
                title="Atualizar"
              >
                ↻
              </button>
            </div>

            {/* Cards Nomus */}
            <div className="flex-1 overflow-y-auto rc-scroll px-3 py-3 space-y-2.5">
              {nomusDocs.length === 0 && !nomusLoading && (
                <div className="text-center py-12">
                  <p className="text-2xl mb-2 opacity-40">📋</p>
                  <p className="text-[11px] text-slate-400">Nenhum documento encontrado no Nomus</p>
                </div>
              )}
              {nomusDocs.map((doc, i) => (
                <NomusDocCard key={doc.id ?? i} doc={doc} />
              ))}
            </div>

            {/* Footer count */}
            {nomusDocs.length > 0 && (
              <div className="flex-shrink-0 px-4 py-2 border-t border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500 text-right">
                  {nomusDocs.length} documento(s) do Nomus
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

      <NomusInserirModal
        recepcao={recepcaoParaNomus}
        onClose={() => setRecepcaoParaNomus(null)}
        onSuccess={() => { fetchNomusDocs(); refresh(); }}
      />
    </>
  );
}
