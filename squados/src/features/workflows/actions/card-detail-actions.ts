'use server';

import { getAuthenticatedUser } from '@/shared/lib/rbac/guards';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createPosVendaClient, type PosVendaType } from '../lib/posvenda-client';
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
        id, instance_id, status, due_at, started_at, notes, assignee_id,
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
  const client = createPosVendaClient();

  const base: PosVendaPayload = { type, uuid, url, items: [] };

  if (type === 'pa') {
    const { data: pa } = await client
      .from('service_requests')
      .select(
        'id, request_number, request_type, status, estimated_cost, notes, tickets(ticket_number, title, clients(name), equipments(serial_number, equipment_models(name)))'
      )
      .eq('id', uuid)
      .maybeSingle();

    if (pa) {
      const ticket = Array.isArray(pa.tickets) ? pa.tickets[0] : pa.tickets;
      const client0 = ticket
        ? (Array.isArray(ticket.clients) ? ticket.clients[0] : ticket.clients)
        : null;
      const eq = ticket
        ? (Array.isArray(ticket.equipments) ? ticket.equipments[0] : ticket.equipments)
        : null;
      const model = eq
        ? (Array.isArray(eq.equipment_models) ? eq.equipment_models[0] : eq.equipment_models)
        : null;

      base.request_number = (pa.request_number as string) ?? null;
      base.request_type = (pa.request_type as string) ?? null;
      base.status = (pa.status as string) ?? null;
      base.estimated_cost = (pa.estimated_cost as number) ?? null;
      base.notes = (pa.notes as string) ?? null;
      base.ticket_number = (ticket?.ticket_number as string) ?? null;
      base.ticket_title = (ticket?.title as string) ?? null;
      base.client_name = (client0?.name as string) ?? null;
      base.equipment_serial = (eq?.serial_number as string) ?? null;
      base.equipment_model = (model?.name as string) ?? null;
    }

    const { data: quote } = await client
      .from('quotes')
      .select('id, quote_number, status, subtotal, total, discount, freight, quote_items(id, description, item_type, quantity, unit_price, unit_cost, products(code, name))')
      .eq('service_request_id', uuid)
      .maybeSingle();

    if (quote) {
      base.quote_number = (quote.quote_number as string) ?? null;
      base.quote_status = (quote.status as string) ?? null;
      base.quote_subtotal = (quote.subtotal as number) ?? null;
      base.quote_total = (quote.total as number) ?? null;
      base.quote_discount = (quote.discount as number) ?? null;
      base.quote_freight = (quote.freight as number) ?? null;
      base.items =
        (quote.quote_items ?? []).map((it: Record<string, unknown>) => {
          const prod = Array.isArray(it.products) ? it.products[0] : it.products;
          return {
            id: it.id as string,
            description: (it.description as string | null) ?? null,
            item_type: (it.item_type as string | null) ?? null,
            quantity: Number(it.quantity ?? 0),
            unit_price: Number(it.unit_price ?? 0),
            unit_cost: Number(it.unit_cost ?? 0),
            product_code: (prod as { code?: string })?.code ?? null,
            product_name: (prod as { name?: string })?.name ?? null,
          } satisfies PosVendaQuoteItem;
        });
    }
  } else {
    // pg
    const { data: pg } = await client
      .from('warranty_claims')
      .select(
        'id, claim_number, warranty_status, defect_description, technical_analysis, covered_parts, internal_cost, tickets(ticket_number, title, clients(name), equipments(serial_number, equipment_models(name)))'
      )
      .eq('id', uuid)
      .maybeSingle();

    if (pg) {
      const ticket = Array.isArray(pg.tickets) ? pg.tickets[0] : pg.tickets;
      const client0 = ticket
        ? (Array.isArray(ticket.clients) ? ticket.clients[0] : ticket.clients)
        : null;
      const eq = ticket
        ? (Array.isArray(ticket.equipments) ? ticket.equipments[0] : ticket.equipments)
        : null;
      const model = eq
        ? (Array.isArray(eq.equipment_models) ? eq.equipment_models[0] : eq.equipment_models)
        : null;

      base.claim_number = (pg.claim_number as string) ?? null;
      base.warranty_status = (pg.warranty_status as string) ?? null;
      base.defect_description = (pg.defect_description as string) ?? null;
      base.technical_analysis = (pg.technical_analysis as string) ?? null;
      base.covered_parts = (pg.covered_parts as string) ?? null;
      base.internal_cost = (pg.internal_cost as number) ?? null;
      base.ticket_number = (ticket?.ticket_number as string) ?? null;
      base.ticket_title = (ticket?.title as string) ?? null;
      base.client_name = (client0?.name as string) ?? null;
      base.equipment_serial = (eq?.serial_number as string) ?? null;
      base.equipment_model = (model?.name as string) ?? null;
    }

    const { data: quote } = await client
      .from('quotes')
      .select('id, subtotal, total, quote_items(id, description, item_type, quantity, unit_price, unit_cost, products(code, name))')
      .eq('warranty_claim_id', uuid)
      .maybeSingle();

    if (quote) {
      base.quote_subtotal = (quote.subtotal as number) ?? null;
      base.quote_total = (quote.total as number) ?? null;
      base.items =
        (quote.quote_items ?? []).map((it: Record<string, unknown>) => {
          const prod = Array.isArray(it.products) ? it.products[0] : it.products;
          return {
            id: it.id as string,
            description: (it.description as string | null) ?? null,
            item_type: (it.item_type as string | null) ?? null,
            quantity: Number(it.quantity ?? 0),
            unit_price: Number(it.unit_price ?? 0),
            unit_cost: Number(it.unit_cost ?? 0),
            product_code: (prod as { code?: string })?.code ?? null,
            product_name: (prod as { name?: string })?.name ?? null,
          } satisfies PosVendaQuoteItem;
        });
    }
  }

  return base;
}
