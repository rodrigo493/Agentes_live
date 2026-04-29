'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { fetchPosVendaCardData, type PosVendaType } from '../lib/posvenda-client';
import type { StepNote } from './pasta-actions';

export interface PosVendaQuoteItem {
  id: string;
  description: string | null;
  item_type: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  product_code?: string | null;
  product_name?: string | null;
}

export interface PosVendaPayload {
  type: PosVendaType;
  uuid: string;
  url: string;
  request_number?: string | null;
  claim_number?: string | null;
  status?: string | null;
  warranty_status?: string | null;
  request_type?: string | null;
  notes?: string | null;
  defect_description?: string | null;
  technical_analysis?: string | null;
  covered_parts?: string | null;
  estimated_cost?: number | null;
  internal_cost?: number | null;
  client_name?: string | null;
  equipment_serial?: string | null;
  equipment_model?: string | null;
  ticket_number?: string | null;
  ticket_title?: string | null;
  quote_number?: string | null;
  quote_status?: string | null;
  quote_total?: number | null;
  quote_subtotal?: number | null;
  quote_discount?: number | null;
  quote_freight?: number | null;
  items: PosVendaQuoteItem[];
}

export interface CardDetail {
  step_id: string;
  instance_id: string;
  reference: string;
  instance_title: string | null;
  instance_metadata: Record<string, unknown>;
  status: string;
  started_at: string | null;
  due_at: string | null;
  notes: StepNote[];
  current_step_order: number;
  current_step_title: string;
  assignee_id: string | null;
  assignee_sector_id: string | null;
  assignee_name: string | null;
  template_id: string;
  template_name: string;
  all_steps: Array<{
    id: string;
    step_order: number;
    title: string;
    sla_hours: number;
  }>;
  history: Array<{
    step_order: number;
    step_title: string;
    status: string;
    assignee_name: string | null;
    notes: StepNote[];
    started_at: string | null;
    completed_at: string | null;
  }>;
  posvenda?: PosVendaPayload | null;
}

type NoteArray = StepNote[] | null | undefined;

export async function getCardDetailAction(stepId: string): Promise<{
  data?: CardDetail;
  error?: string;
}> {
  try {
    await getAuthenticatedUser();
    const admin = createAdminClient();

    const { data: step, error: stepErr } = await admin
      .from('workflow_steps')
      .select(`
        id, instance_id, status, due_at, started_at, notes, assignee_id, assignee_sector_id,
        template_step_id,
        assignee:profiles!workflow_steps_assignee_id_fkey(full_name),
        instance:workflow_instances!workflow_steps_instance_id_fkey!inner(
          id, reference, title, template_id, metadata,
          template:workflow_templates!inner(
            id, name,
            workflow_template_steps(id, step_order, title, sla_hours)
          )
        ),
        template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(
          id, step_order, title
        )
      `)
      .eq('id', stepId)
      .single();

    if (stepErr) return { error: stepErr.message };
    if (!step) return { error: 'Step não encontrado' };

    const inst = Array.isArray(step.instance) ? step.instance[0] : step.instance;
    if (!inst) return { error: 'Instance não encontrada' };

    const tmpl = Array.isArray(inst.template) ? inst.template[0] : inst.template;
    const tmplSteps: Array<{ id: string; step_order: number; title: string; sla_hours: number }> =
      (tmpl?.workflow_template_steps ?? []).slice().sort(
        (a: { step_order: number }, b: { step_order: number }) => a.step_order - b.step_order
      );

    const tplStep = Array.isArray(step.template_step) ? step.template_step[0] : step.template_step;
    const asg = Array.isArray(step.assignee) ? step.assignee[0] : step.assignee;

    // Histórico: todos os steps da instance (exceto o atual), com assignee
    const { data: allSteps } = await admin
      .from('workflow_steps')
      .select(`
        id, step_order, status, notes, started_at, completed_at,
        assignee:profiles!workflow_steps_assignee_id_fkey(full_name),
        template_step:workflow_template_steps!workflow_steps_template_step_id_fkey(title)
      `)
      .eq('instance_id', inst.id)
      .order('step_order', { ascending: true });

    const history =
      (allSteps ?? [])
        .filter((s) => s.id !== stepId)
        .map((s) => {
          const asgRow = Array.isArray(s.assignee) ? s.assignee[0] : s.assignee;
          const tplRow = Array.isArray(s.template_step) ? s.template_step[0] : s.template_step;
          return {
            step_order: s.step_order as number,
            step_title: (tplRow?.title as string) ?? 'Etapa',
            status: s.status as string,
            assignee_name: (asgRow?.full_name as string) ?? null,
            notes: ((s.notes as NoteArray) ?? []) as StepNote[],
            started_at: (s.started_at as string | null) ?? null,
            completed_at: (s.completed_at as string | null) ?? null,
          };
        });

    // PosVenda: se existir UUID no metadata, busca dados no Supabase externo
    let posvenda: PosVendaPayload | null = null;
    const metadata = (inst.metadata as Record<string, unknown>) ?? {};
    const pv = metadata.posvenda as
      | { type: PosVendaType; uuid: string; url: string }
      | undefined;

    if (pv?.uuid && pv?.type) {
      try {
        posvenda = await fetchPosVendaDetails(pv.type, pv.uuid, pv.url);
      } catch (err) {
        console.error('[card-detail] fetch posvenda falhou:', err);
      }
    }

    return {
      data: {
        step_id: step.id as string,
        instance_id: inst.id as string,
        reference: inst.reference as string,
        instance_title: (inst.title as string | null) ?? null,
        instance_metadata: metadata,
        status: step.status as string,
        started_at: (step.started_at as string | null) ?? null,
        due_at: (step.due_at as string | null) ?? null,
        notes: ((step.notes as NoteArray) ?? []) as StepNote[],
        current_step_order: (tplStep?.step_order as number) ?? 1,
        current_step_title: (tplStep?.title as string) ?? 'Etapa',
        assignee_id: (step.assignee_id as string | null) ?? null,
        assignee_sector_id: (step.assignee_sector_id as string | null) ?? null,
        assignee_name: (asg?.full_name as string) ?? null,
        template_id: tmpl?.id as string,
        template_name: (tmpl?.name as string) ?? 'Fluxo',
        all_steps: tmplSteps,
        history,
        posvenda,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'unknown' };
  }
}

async function fetchPosVendaDetails(
  type: PosVendaType,
  uuid: string,
  url: string
): Promise<PosVendaPayload> {
  const data = await fetchPosVendaCardData(type, uuid);

  const isPa = type === 'pa';

  return {
    type,
    uuid,
    url,
    request_number: isPa ? (data.number ?? null) : null,
    claim_number: !isPa ? (data.number ?? null) : null,
    status: data.status ?? null,
    warranty_status: data.pg_details?.warranty_status ?? null,
    request_type: data.pa_details?.request_type ?? null,
    notes: data.pa_details?.notes ?? null,
    defect_description: data.pg_details?.defect_description ?? null,
    technical_analysis: data.pg_details?.technical_analysis ?? null,
    covered_parts: data.pg_details?.covered_parts ?? null,
    estimated_cost: data.pa_details?.estimated_cost ?? null,
    internal_cost: data.pg_details?.internal_cost ?? null,
    client_name: data.client?.name ?? null,
    equipment_serial: data.equipment?.serial_number ?? null,
    equipment_model: data.equipment?.model?.name ?? null,
    ticket_number: data.ticket?.ticket_number ?? null,
    ticket_title: data.ticket?.title ?? null,
    quote_number: data.quote?.quote_number ?? null,
    quote_status: data.quote?.status ?? null,
    quote_subtotal: data.quote?.subtotal ?? null,
    quote_total: data.quote?.total ?? null,
    quote_discount: data.quote?.discount ?? null,
    quote_freight: data.quote?.freight ?? null,
    items: (data.items ?? []).map((it, idx) => ({
      id: it.id ?? String(idx),
      description: it.description ?? null,
      item_type: mapItemType(it),
      quantity: Number(it.quantity ?? 0),
      unit_price: Number(it.unit_price ?? 0),
      unit_cost: Number(it.unit_cost ?? 0),
      product_code: it.code ?? null,
      product_name: it.product_name ?? null,
    })),
  };
}

function mapItemType(it: { item_type?: string | null; is_warranty?: boolean }): string | null {
  if (it.item_type) return it.item_type;
  if (typeof it.is_warranty === 'boolean') {
    return it.is_warranty ? 'peca_garantia' : 'peca_cobrada';
  }
  return null;
}
