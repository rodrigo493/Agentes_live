import { createClient } from '@supabase/supabase-js';

export function createPosVendaClient() {
  const url = process.env.POSVENDA_SUPABASE_URL;
  const key = process.env.POSVENDA_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('POSVENDA_SUPABASE_URL / POSVENDA_SUPABASE_ANON_KEY not configured');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type PosVendaType = 'pa' | 'pg';

export function extractPosVendaFromUrl(url: string): { type: PosVendaType; uuid: string } | null {
  const paMatch = url.match(/\/pedidos-acessorios\/([0-9a-f-]{36})/i);
  if (paMatch) return { type: 'pa', uuid: paMatch[1] };
  const pgMatch = url.match(/\/pedidos-garantia\/([0-9a-f-]{36})/i);
  if (pgMatch) return { type: 'pg', uuid: pgMatch[1] };
  return null;
}
