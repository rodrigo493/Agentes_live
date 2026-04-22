'use client';

import { useMemo, useRef, useState } from 'react';
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

export function CardDetailShell({ detail, attachments, currentUserId, isAdmin }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [advanceNote, setAdvanceNote] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const canAct = isAdmin || detail.assignee_id === currentUserId;
  const nextStep = useMemo(
    () => detail.all_steps.find((s) => s.step_order === detail.current_step_order + 1) ?? null,
    [detail.all_steps, detail.current_step_order]
  );

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

  async function handleAdvance() {
    if (!canAct) return;
    if (!advanceNote.trim()) {
      toast.error('Preencha as recomendações para a próxima etapa');
      return;
    }
    if (!confirm('Confirmar avanço para a próxima etapa?')) return;
    setAdvancing(true);
    try {
      const r = await advanceWithNoteAction(detail.step_id, advanceNote.trim());
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(nextStep ? `Avançado para "${nextStep.title}"` : 'Fluxo concluído');
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
        <div className={`inline-flex items-center gap-1 text-sm font-semibold ${slaInfo.tone}`}>
          <Clock className="w-4 h-4" /> {slaInfo.label}
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
            <ChevronRight className="w-4 h-4 text-emerald-600" />
            {nextStep ? `Avançar para: ${nextStep.title}` : 'Concluir fluxo'}
          </h2>
          <textarea
            value={advanceNote}
            onChange={(e) => setAdvanceNote(e.target.value)}
            rows={3}
            placeholder={
              nextStep
                ? `Recomendações para o próximo responsável (${nextStep.title})…`
                : 'Observações finais do fluxo…'
            }
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
          />
          <button
            onClick={handleAdvance}
            disabled={advancing || !advanceNote.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {advancing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : nextStep ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {advancing ? 'Processando…' : nextStep ? 'Avançar etapa' : 'Concluir fluxo'}
          </button>
        </div>
      )}
    </div>
  );
}

function PosVendaSection({
  posvenda,
}: {
  posvenda: NonNullable<CardDetail['posvenda']>;
}) {
  const isPa = posvenda.type === 'pa';
  const title = isPa ? 'Pedido de Acessório' : 'Pedido de Garantia';
  const number = posvenda.request_number ?? posvenda.claim_number ?? posvenda.uuid.slice(0, 8);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{number}</p>
        </div>
        <a
          href={posvenda.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          Abrir no LivePosVenda <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Field label="Cliente" value={posvenda.client_name} />
        <Field label="Ticket" value={posvenda.ticket_number} />
        <Field label="Equipamento" value={posvenda.equipment_model} />
        <Field label="Nº de série" value={posvenda.equipment_serial} />
        {isPa ? (
          <>
            <Field label="Tipo" value={posvenda.request_type} />
            <Field label="Status" value={posvenda.status} />
            <Field label="Custo estimado" value={fmtCurrency(posvenda.estimated_cost)} />
          </>
        ) : (
          <>
            <Field label="Status garantia" value={posvenda.warranty_status} />
            <Field label="Custo interno" value={fmtCurrency(posvenda.internal_cost)} />
          </>
        )}
      </div>

      {posvenda.notes && (
        <div className="text-xs">
          <span className="font-semibold">Notas do PA:</span>{' '}
          <span className="text-muted-foreground whitespace-pre-wrap">{posvenda.notes}</span>
        </div>
      )}
      {posvenda.defect_description && (
        <div className="text-xs">
          <span className="font-semibold">Defeito:</span>{' '}
          <span className="text-muted-foreground whitespace-pre-wrap">
            {posvenda.defect_description}
          </span>
        </div>
      )}
      {posvenda.technical_analysis && (
        <div className="text-xs">
          <span className="font-semibold">Análise técnica:</span>{' '}
          <span className="text-muted-foreground whitespace-pre-wrap">
            {posvenda.technical_analysis}
          </span>
        </div>
      )}
      {posvenda.covered_parts && (
        <div className="text-xs">
          <span className="font-semibold">Peças cobertas:</span>{' '}
          <span className="text-muted-foreground whitespace-pre-wrap">{posvenda.covered_parts}</span>
        </div>
      )}

      {posvenda.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-2 py-1.5 font-semibold">Item</th>
                <th className="text-left px-2 py-1.5 font-semibold">Tipo</th>
                <th className="text-right px-2 py-1.5 font-semibold">Qtd</th>
                <th className="text-right px-2 py-1.5 font-semibold">Unitário</th>
                <th className="text-right px-2 py-1.5 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {posvenda.items.map((it: PosVendaQuoteItem) => (
                <tr key={it.id} className="border-b">
                  <td className="px-2 py-1.5">
                    {it.product_code ? <span className="text-muted-foreground">{it.product_code} · </span> : null}
                    {it.product_name ?? it.description ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{it.item_type ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                  <td className="px-2 py-1.5 text-right">{fmtCurrency(it.unit_price)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">
                    {fmtCurrency(it.quantity * it.unit_price)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2">
                <td colSpan={4} className="px-2 py-1.5 text-right font-semibold">
                  Subtotal
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  {fmtCurrency(posvenda.quote_subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="px-2 py-1.5 text-right font-semibold">
                  Total
                </td>
                <td className="px-2 py-1.5 text-right font-bold text-primary">
                  {fmtCurrency(posvenda.quote_total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Sem itens cadastrados — preencha no LivePosVenda ou adicione manualmente.
        </p>
      )}
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
