export type PosVendaType = 'pa' | 'pg';

export function extractPosVendaFromUrl(url: string): { type: PosVendaType; uuid: string } | null {
  const paMatch = url.match(/\/pedidos-acessorios\/([0-9a-f-]{36})/i);
  if (paMatch) return { type: 'pa', uuid: paMatch[1] };
  const pgMatch = url.match(/\/pedidos-garantia\/([0-9a-f-]{36})/i);
  if (pgMatch) return { type: 'pg', uuid: pgMatch[1] };
  return null;
}

export interface PosVendaCardDataResponse {
  record_type: PosVendaType;
  number?: string | null;
  status?: string | null;
  url?: string | null;
  client?: {
    name?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
  } | null;
  ticket?: {
    ticket_number?: string | null;
    title?: string | null;
  } | null;
  equipment?: {
    serial_number?: string | null;
    model?: { name?: string | null } | null;
  } | null;
  quote?: {
    quote_number?: string | null;
    status?: string | null;
    subtotal?: number | null;
    total?: number | null;
    discount?: number | null;
    freight?: number | null;
  } | null;
  items?: Array<{
    id?: string;
    code?: string | null;
    product_name?: string | null;
    description?: string | null;
    item_type?: string | null;
    quantity?: number;
    unit_price?: number;
    unit_cost?: number;
    is_warranty?: boolean;
  }>;
  pa_details?: {
    estimated_cost?: number | null;
    request_type?: string | null;
    notes?: string | null;
  } | null;
  pg_details?: {
    defect_description?: string | null;
    technical_analysis?: string | null;
    covered_parts?: string | null;
    internal_cost?: number | null;
    warranty_period_months?: number | null;
    warranty_status?: string | null;
  } | null;
}

export async function fetchPosVendaCardData(
  type: PosVendaType,
  uuid: string
): Promise<PosVendaCardDataResponse> {
  const url = process.env.POSVENDA_CARD_DATA_URL;
  const token = process.env.POSVENDA_READ_TOKEN;
  if (!url || !token) {
    throw new Error('POSVENDA_CARD_DATA_URL / POSVENDA_READ_TOKEN not configured');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ record_type: type, record_id: uuid }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`posvenda-card-data ${res.status}: ${text}`);
  }

  return (await res.json()) as PosVendaCardDataResponse;
}
