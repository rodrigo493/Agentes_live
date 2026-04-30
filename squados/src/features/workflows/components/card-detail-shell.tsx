'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Paperclip,
  Upload,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  ChevronRight,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Clock,
  RefreshCw,
  TriangleAlert,
  X,
  GitFork,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/shared/lib/supabase/client';
import { advanceWithNoteAction, addNoteToStepAction } from '../actions/pasta-actions';
import {
  uploadWorkflowAttachmentAction,
  getSignedAttachmentUrlAction,
  type WorkflowAttachment,
} from '../actions/workflow-attachment-actions';
import type { CardDetail, PosVendaQuoteItem } from '../actions/card-detail-actions';

interface Props {
  detail: CardDetail;
  attachments: WorkflowAttachment[];
  currentUserId: string;
  currentUserSectorId: string | null;
  isAdmin: boolean;
}

function mimeIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-blue-500" />;
  if (mime.includes('sheet') || mime.includes('excel'))
    return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
  return <FileText className="w-4 h-4 text-zinc-500" />;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ObservacoesButton({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative inline-flex items-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-400 px-4 py-2.5 text-sm font-bold text-amber-900 shadow-lg transition-all hover:bg-amber-300 hover:border-amber-300 focus:outline-none"
          style={{ animation: 'observacoes-pulse 2s ease-in-out infinite' }}
        >
          <TriangleAlert className="h-5 w-5 shrink-0" />
          Observações do Pos-Venda
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-500 border-2 border-white"
            style={{ animation: 'observacoes-dot 2s ease-in-out infinite' }} />
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative w-full max-w-md rounded-2xl border-2 border-amber-400 bg-white dark:bg-zinc-900 shadow-2xl p-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Observações do Pos-Venda
              </h3>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {notes}
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes observacoes-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.7); }
          50% { box-shadow: 0 0 0 8px rgba(251, 191, 36, 0); }
        }
        @keyframes observacoes-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </>
  );
}

export function CardDetailShell({ detail, attachments, currentUserId, currentUserSectorId, isAdmin }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [advanceNote, setAdvanceNote] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh: a cada 30s e quando a aba volta a ter foco.
  // Garante que mudancas feitas no LivePosVenda apareçam sem recarregar manual.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    const onFocus = () => router.refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [router]);

  async function handleManualRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  const canAct = isAdmin
    || detail.assignee_id === currentUserId
    || (!!detail.assignee_sector_id && !!currentUserSectorId && detail.assignee_sector_id === currentUserSectorId);
  const nextStep = useMemo(
    () => detail.all_steps.find((s) => s.step_order === detail.current_step_order + 1) ?? null,
    [detail.all_steps, detail.current_step_order]
  );
  const branches = detail.current_step_branch_options;
  const hasBranches = !!branches && branches.length >= 2;
  const singleBranch = branches?.length === 1 ? branches[0] : null;
  const completeLabel = detail.current_step_complete_label;

  const slaInfo = useMemo(() => {
    if (!detail.due_at) return { label: 'sem prazo', tone: 'text-gray-500' };
    const dueMs = new Date(detail.due_at).getTime();
    const diffMs = dueMs - Date.now();
    if (diffMs < 0) {
      const h = Math.floor(Math.abs(diffMs) / 3_600_000);
      return { label: `atrasado +${h}h`, tone: 'text-red-600' };
    }
    const h = Math.floor(diffMs / 3_600_000);
    return { label: `faltam ${h}h`, tone: 'text-emerald-600' };
  }, [detail.due_at]);

  async function handleFilePicked(files: FileList | null) {
    if (!files || files.length === 0 || !canAct) return;
    setUploading(true);
    try {
      const supabase = createClient();
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop() ?? 'bin';
        const path = `workflow/${detail.instance_id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('workflow-attachments')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast.error(`${file.name}: ${upErr.message}`);
          continue;
        }
        const { error } = await uploadWorkflowAttachmentAction({
          instanceId: detail.instance_id,
          stepId: detail.step_id,
          storagePath: path,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
        });
        if (error) toast.error(error);
      }
      toast.success('Arquivos enviados');
      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleOpenAttachment(a: WorkflowAttachment) {
    const url = await getSignedAttachmentUrlAction(a.storage_path);
    if (url) window.open(url, '_blank');
    else toast.error('Falha ao gerar link');
  }

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const r = await addNoteToStepAction(detail.step_id, newNote.trim());
      if (r.error) toast.error(r.error);
      else {
        toast.success('Observação salva');
        setNewNote('');
        router.refresh();
      }
    } finally {
      setSavingNote(false);
    }
  }

  async function handleAdvance(targetStepTitle?: string) {
    if (!canAct) return;
    if (!advanceNote.trim()) {
      toast.error('Preencha as recomendações para a próxima etapa');
      return;
    }
    if (!confirm('Confirmar avanço para a próxima etapa?')) return;
    setAdvancing(true);
    try {
      const r = await advanceWithNoteAction(detail.step_id, advanceNote.trim(), targetStepTitle);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const destLabel = targetStepTitle ?? nextStep?.title;
      toast.success(destLabel ? `Avançado para "${destLabel}"` : 'Fluxo concluído');
      router.push('/operations');
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link
          href="/operations"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para Operações
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-muted disabled:opacity-50"
            title="Atualizar dados do PA/PG"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <div className={`inline-flex items-center gap-1 text-sm font-semibold ${slaInfo.tone}`}>
            <Clock className="w-4 h-4" /> {slaInfo.label}
          </div>
        </div>
      </div>

      {/* Cabeçalho */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold">{detail.reference}</h1>
          <span className="text-sm text-muted-foreground">· {detail.template_name}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5">
            Etapa {detail.current_step_order}: {detail.current_step_title}
          </span>
        </div>
        {detail.instance_title && (
          <p className="text-sm text-muted-foreground">{detail.instance_title}</p>
        )}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Responsável: <strong className="text-foreground">{detail.assignee_name ?? '—'}</strong></span>
          <span>Iniciada em {fmtDateTime(detail.started_at)}</span>
          <span>Prazo {fmtDateTime(detail.due_at)}</span>
        </div>
        {/* Steps pipeline */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2">
          {detail.all_steps.map((s) => {
            const isCurrent = s.step_order === detail.current_step_order;
            const isPast = s.step_order < detail.current_step_order;
            return (
              <div
                key={s.id}
                className={`shrink-0 text-[11px] px-2 py-1 rounded border ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : isPast
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {s.step_order}. {s.title}
              </div>
            );
          })}
        </div>
      </div>

      {/* Observações do LivePosVenda — botão pulsante amarelo */}
      {!!detail.instance_metadata?.notes && (
        <ObservacoesButton notes={detail.instance_metadata.notes as string} />
      )}

      {/* Dados do PA/PG */}
      {detail.posvenda ? (
        <PosVendaSection posvenda={detail.posvenda} />
      ) : (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Nenhum PA/PG vinculado. Card criado manualmente — preencha as observações conforme necessário.
          </p>
        </div>
      )}

      {/* Anexos */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Paperclip className="w-4 h-4" /> Anexos ({attachments.length})
          </h2>
          {canAct && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-xs font-semibold disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Enviando…' : 'Adicionar arquivo'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.xlsx,.xls,.doc,.docx"
            onChange={(e) => handleFilePicked(e.target.files)}
          />
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum arquivo anexado.</p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs"
              >
                {mimeIcon(a.mime_type)}
                <button
                  onClick={() => handleOpenAttachment(a)}
                  className="flex-1 text-left font-medium hover:underline truncate"
                >
                  {a.file_name}
                </button>
                <span className="text-muted-foreground shrink-0">{fmtSize(a.file_size)}</span>
                <span className="text-muted-foreground shrink-0">
                  {a.step_title} · {a.uploader_name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Histórico */}
      {detail.history.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Histórico de etapas</h2>
          <ol className="space-y-2">
            {detail.history.map((h) => (
              <li key={h.step_order} className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {h.step_order}. {h.step_title}
                  </span>
                  <span className="text-muted-foreground">
                    {h.status} · {h.assignee_name ?? '—'}
                  </span>
                </div>
                {h.notes.length > 0 && (
                  <ul className="space-y-1 pl-2 border-l-2 border-border">
                    {h.notes.map((n, i) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{n.author_name}:</span>{' '}
                        {n.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Observações + Avançar */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Observações da etapa atual</h2>
        {detail.notes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhuma observação ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.notes.map((n, i) => (
              <li key={i} className="rounded-lg border bg-muted/20 p-2 text-xs">
                <span className="font-semibold">{n.author_name}:</span> {n.text}
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {fmtDateTime(n.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canAct && (
          <div className="space-y-1.5 pt-2 border-t">
            <label className="text-xs font-semibold">Adicionar observação</label>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={2}
              placeholder="O que foi feito nesta etapa?"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
            />
            <button
              onClick={handleAddNote}
              disabled={savingNote || !newNote.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-50 hover:bg-muted"
            >
              {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '+'} Salvar observação
            </button>
          </div>
        )}
      </div>

      {/* Avançar */}
      {canAct && (
        <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            {hasBranches ? (
              <GitFork className="w-4 h-4 text-emerald-600" />
            ) : (
              <ChevronRight className="w-4 h-4 text-emerald-600" />
            )}
            {hasBranches
              ? 'Selecionar próxima etapa'
              : singleBranch
                ? `Avançar para: ${singleBranch.label}`
                : nextStep
                  ? `Avançar para: ${nextStep.title}`
                  : (completeLabel ? `Marcar como: ${completeLabel}` : 'Concluir fluxo')}
          </h2>

          <textarea
            value={advanceNote}
            onChange={(e) => setAdvanceNote(e.target.value)}
            rows={3}
            placeholder={
              hasBranches
                ? 'Observações antes de selecionar o destino…'
                : nextStep || singleBranch
                  ? `Recomendações para o próximo responsável…`
                  : 'Observações finais do fluxo…'
            }
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
          />

          {/* Botões de ramificação (2+ opções) */}
          {hasBranches ? (
            <div className="space-y-2">
              {branches!.map((b) => (
                <button
                  key={b.target_title}
                  type="button"
                  disabled={advancing || !advanceNote.trim()}
                  onClick={() => handleAdvance(b.target_title)}
                  className="w-full flex items-center gap-2 rounded-xl border-2 border-primary/20 hover:border-primary bg-primary/5 hover:bg-primary/10 px-4 py-2.5 text-sm font-semibold text-left transition-all disabled:opacity-50"
                >
                  {advancing
                    ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    : <ChevronRight className="w-4 h-4 shrink-0 text-primary" />}
                  {b.label}
                </button>
              ))}
            </div>
          ) : (
            /* Botão único (1 branch ou linear ou final) */
            <button
              onClick={() => handleAdvance(singleBranch?.target_title)}
              disabled={advancing || !advanceNote.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {advancing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : singleBranch || nextStep ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {advancing
                ? 'Processando…'
                : singleBranch
                  ? singleBranch.label
                  : nextStep
                    ? 'Avançar etapa'
                    : (completeLabel ?? 'Concluir fluxo')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  peca_cobrada: 'Peça (Cobrada)',
  peca_garantia: 'Peça (Garantia)',
  servico_cobrado: 'Serviço (Cobrado)',
  servico_garantia: 'Serviço (Garantia)',
  frete: 'Frete',
  desconto: 'Desconto',
};

const QUOTE_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
};

function sumByType(items: PosVendaQuoteItem[], types: string[]): number {
  return items
    .filter((it) => it.item_type && types.includes(it.item_type))
    .reduce((acc, it) => acc + it.quantity * it.unit_price, 0);
}

function PosVendaSection({
  posvenda,
}: {
  posvenda: NonNullable<CardDetail['posvenda']>;
}) {
  const isPa = posvenda.type === 'pa';
  const number = posvenda.request_number ?? posvenda.claim_number ?? posvenda.uuid.slice(0, 8);

  const pecas = sumByType(posvenda.items, ['peca_cobrada']);
  const servicos = sumByType(posvenda.items, ['servico_cobrado']);
  const garantia = sumByType(posvenda.items, ['peca_garantia', 'servico_garantia']);
  const freteFromItems = sumByType(posvenda.items, ['frete']);
  const frete = posvenda.quote_freight ?? freteFromItems;
  const desconto = posvenda.quote_discount ?? 0;
  const custoTotal = posvenda.items.reduce((acc, it) => acc + it.quantity * it.unit_cost, 0);
  const total = posvenda.quote_total ?? (pecas + servicos + frete - desconto);
  const margem = total > 0 ? ((total - custoTotal) / total) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Header com número */}
      <div className="flex items-center flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-bold leading-none">{number}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {posvenda.client_name ?? '—'}
              {posvenda.equipment_model ? ` · ${posvenda.equipment_model}` : ''}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(isPa ? posvenda.status : posvenda.warranty_status) && (
            <span className="rounded-full bg-orange-100 text-orange-800 text-[11px] font-semibold px-2.5 py-1">
              {isPa ? posvenda.status : posvenda.warranty_status}
            </span>
          )}
          <a
            href={posvenda.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-muted"
          >
            <ExternalLink className="w-3 h-3" /> Abrir no LivePosVenda
          </a>
        </div>
      </div>

      {/* Cliente + Equipamento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Cliente
          </p>
          <p className="text-sm font-semibold mt-1">{posvenda.client_name ?? '—'}</p>
          {posvenda.ticket_number && (
            <p className="text-xs text-muted-foreground mt-1">
              Chamado: {posvenda.ticket_number}
              {posvenda.ticket_title ? ` — ${posvenda.ticket_title}` : ''}
            </p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Equipamento
          </p>
          <p className="text-sm font-semibold mt-1">{posvenda.equipment_model ?? '—'}</p>
          {posvenda.equipment_serial && (
            <p className="text-xs text-muted-foreground mt-1">
              Nº série: {posvenda.equipment_serial}
            </p>
          )}
        </div>
      </div>

      {/* Orçamento de origem */}
      {(posvenda.quote_number || posvenda.quote_total != null) && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Orçamento de Origem
            </p>
            {posvenda.quote_number && (
              <span className="inline-flex items-center gap-1 text-xs border rounded-lg px-3 py-1 bg-muted/30">
                <ExternalLink className="w-3 h-3" /> {posvenda.quote_number}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">
                Status do orçamento
              </p>
              <p className="text-sm font-medium mt-0.5">
                {QUOTE_STATUS_LABEL[posvenda.quote_status ?? ''] ?? posvenda.quote_status ?? '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">Total</p>
              <p className="text-2xl font-bold text-orange-500">{fmtCurrency(total)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown por tipo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <BreakdownCard label="Peças" value={pecas} />
        <BreakdownCard label="Serviços" value={servicos} />
        <BreakdownCard label="Frete" value={frete} />
        <BreakdownCard label="Desconto" value={-desconto} negative />
        <BreakdownCard label="Garantia" value={garantia} highlight="emerald" />
        <BreakdownCard label="Margem" value={null} suffix={`${margem.toFixed(1)}%`} />
      </div>

      {/* Total Cobrado */}
      <div className="rounded-xl bg-orange-100/70 border border-orange-200 px-5 py-4 flex items-center justify-between">
        <span className="text-base font-semibold text-orange-900">Total Cobrado do Cliente</span>
        <span className="text-2xl font-bold text-orange-500">{fmtCurrency(total)}</span>
      </div>

      {/* Itens do pedido */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <h3 className="text-sm font-semibold">
            Itens do Pedido ({posvenda.items.length})
          </h3>
          {posvenda.quote_number && (
            <span className="inline-flex items-center gap-1 text-[11px] border rounded-lg px-2 py-1">
              Origem: {posvenda.quote_number}
            </span>
          )}
        </div>
        {posvenda.items.length === 0 ? (
          <p className="p-6 text-xs text-muted-foreground italic text-center">
            Sem itens cadastrados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2 font-semibold">Código</th>
                  <th className="text-left px-4 py-2 font-semibold">Descrição</th>
                  <th className="text-left px-4 py-2 font-semibold">Tipo</th>
                  <th className="text-center px-4 py-2 font-semibold">Qtd</th>
                  <th className="text-right px-4 py-2 font-semibold">Preço Unit.</th>
                  <th className="text-right px-4 py-2 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {posvenda.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {it.product_code ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {it.product_name ?? it.description ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {it.item_type ? (
                        <span className="inline-flex items-center rounded-md bg-muted/60 px-2 py-0.5 text-[11px]">
                          {ITEM_TYPE_LABEL[it.item_type] ?? it.item_type}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">{it.quantity}</td>
                    <td className="px-4 py-3 text-right">{fmtCurrency(it.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {fmtCurrency(it.quantity * it.unit_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Observações + Custo Estimado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 rounded-xl border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Observações
          </p>
          <p className="text-sm whitespace-pre-wrap mt-1">
            {posvenda.notes ?? posvenda.defect_description ?? '—'}
          </p>
          {posvenda.technical_analysis && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-3">
                Análise técnica
              </p>
              <p className="text-sm whitespace-pre-wrap mt-1">{posvenda.technical_analysis}</p>
            </>
          )}
          {posvenda.covered_parts && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-3">
                Peças cobertas
              </p>
              <p className="text-sm whitespace-pre-wrap mt-1">{posvenda.covered_parts}</p>
            </>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {isPa ? 'Custo Estimado (R$)' : 'Custo Interno (R$)'}
          </p>
          <p className="text-lg font-semibold mt-1">
            {fmtCurrency(isPa ? posvenda.estimated_cost : posvenda.internal_cost)}
          </p>
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({
  label,
  value,
  negative,
  highlight,
  suffix,
}: {
  label: string;
  value: number | null;
  negative?: boolean;
  highlight?: 'emerald';
  suffix?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3 bg-card ${
        highlight === 'emerald' ? 'border-emerald-300 bg-emerald-50/50' : ''
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="text-base font-semibold mt-1">
        {suffix ?? (
          <>
            {negative && value !== 0 ? '- ' : ''}
            {fmtCurrency(value == null ? 0 : Math.abs(value))}
          </>
        )}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value ?? '—'}</span>
    </div>
  );
}
