import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const NOMUS_BASE = 'https://live.nomus.com.br/live/rest';
const NOMUS_AUTH = `Basic ${Deno.env.get('NOMUS_BASIC_AUTH') ?? 'aW50ZWdyYWRvcmVycDptOE9SQ3JUZ3VTcHFkeDE='}`;
const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? ''; // Rodrigo's chat ID

// ── Nomus helpers ─────────────────────────────────────────────

async function buscarPedidoCompra(codigo: string): Promise<{ encontrado: boolean; dados: unknown }> {
  try {
    const res = await fetch(
      `${NOMUS_BASE}/pedidoscompra?codigoPedido=${encodeURIComponent(codigo)}`,
      { headers: { Authorization: NOMUS_AUTH, Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return { encontrado: false, dados: null };
    const dados = await res.json();
    const lista = Array.isArray(dados) ? dados : (dados.data ?? dados.items ?? [dados]);
    return { encontrado: lista.length > 0, dados: lista[0] ?? null };
  } catch {
    return { encontrado: false, dados: null };
  }
}

async function buscarDocumentosEntrada(nfNumero: string): Promise<{ encontrado: boolean; dados: unknown }> {
  try {
    const res = await fetch(
      `${NOMUS_BASE}/documentosEntrada?numeroNF=${encodeURIComponent(nfNumero)}`,
      { headers: { Authorization: NOMUS_AUTH, Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return { encontrado: false, dados: null };
    const dados = await res.json();
    const lista = Array.isArray(dados) ? dados : (dados.data ?? dados.items ?? [dados]);
    return { encontrado: lista.length > 0, dados: lista[0] ?? null };
  } catch {
    return { encontrado: false, dados: null };
  }
}

// ── Telegram helper ───────────────────────────────────────────

async function enviarTelegram(mensagem: string) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensagem, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(5_000),
    },
  ).catch(() => null);
}

// ── Processamento principal ───────────────────────────────────

interface EventoRow {
  id: string;
  dados: {
    nf_numero: string;
    fornecedor: string;
    valor_total: number;
    pedido_compra_nomus?: string;
    observacoes?: string;
    recepcao_id?: string;
  };
}

async function processarEvento(evento: EventoRow): Promise<void> {
  const { id, dados } = evento;

  // 1. Marcar como processando
  await supabase
    .from('eventos_autonomos')
    .update({ status: 'processando' })
    .eq('id', id);

  let pcEncontrado = false;
  let dadosNomus: unknown = null;
  const divergencias: string[] = [];
  const itensValidados: unknown[] = [];
  let etapaDestino: 'entrada_nota' | 'recusa_nota' = 'entrada_nota';

  // 2. Buscar documento de entrada no Nomus pela NF
  const docResult = await buscarDocumentosEntrada(dados.nf_numero);
  if (docResult.encontrado) {
    dadosNomus = docResult.dados;
  }

  // 3. Buscar PC no Nomus (se informado)
  if (dados.pedido_compra_nomus) {
    const pcResult = await buscarPedidoCompra(dados.pedido_compra_nomus);
    pcEncontrado = pcResult.encontrado;

    if (pcResult.encontrado && pcResult.dados) {
      const pc = pcResult.dados as Record<string, unknown>;
      const itens = (pc.itens ?? pc.items ?? []) as Array<Record<string, unknown>>;

      for (const item of itens) {
        itensValidados.push({
          codigo: item.codigoProduto ?? item.codigo ?? '—',
          descricao: item.descricaoProduto ?? item.descricao ?? '—',
          qtd_pedida: item.quantidade ?? item.qtdPedida,
          validado: true,
        });
      }

      if (itens.length === 0) {
        divergencias.push('PC encontrado mas sem itens listados');
      }
    } else {
      divergencias.push(`Pedido de Compra ${dados.pedido_compra_nomus} não encontrado no Nomus`);
    }
  }

  // 4. Definir etapa destino
  if (divergencias.length > 0) {
    etapaDestino = 'recusa_nota';
  }

  const resumo = divergencias.length > 0
    ? `NF ${dados.nf_numero} — ${divergencias.length} divergência(s): ${divergencias.join('; ')}`
    : `NF ${dados.nf_numero} recebida. ${itensValidados.length > 0 ? `${itensValidados.length} itens conferidos.` : 'Sem PC vinculado.'}`;

  // 5. Atualizar evento_autonomo
  await supabase
    .from('eventos_autonomos')
    .update({
      status: 'concluido',
      resultado: {
        pc_encontrado: pcEncontrado,
        itens_validados: itensValidados,
        divergencias,
        resumo,
        dados_nomus: dadosNomus,
      },
      processado_em: new Date().toISOString(),
    })
    .eq('id', id);

  // 6. Atualizar recepcao_mercadorias
  const recepcaoId = dados.recepcao_id;
  if (recepcaoId) {
    await supabase
      .from('recepcao_mercadorias')
      .update({
        etapa: etapaDestino,
        pc_encontrado: pcEncontrado,
        itens_validados: itensValidados,
        divergencias,
        resumo_friday: resumo,
        dados_nomus: dadosNomus,
        processado_por_friday: true,
        processado_em: new Date().toISOString(),
      })
      .eq('id', recepcaoId);
  }

  // 7. Enviar Telegram
  const emoji = divergencias.length > 0 ? '⚠️' : '✅';
  const msgTelegram = `${emoji} *Friday — Recepção Processada*\n\n📦 NF: \`${dados.nf_numero}\`\n🏢 Fornecedor: ${dados.fornecedor}\n💰 Valor: R$ ${Number(dados.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n🗂 PC: ${dados.pedido_compra_nomus ?? '—'}\n\n${resumo}${divergencias.length > 0 ? `\n\n⚠️ Divergências:\n${divergencias.map(d => `• ${d}`).join('\n')}` : ''}`;

  await enviarTelegram(msgTelegram);

  if (recepcaoId) {
    await supabase
      .from('recepcao_mercadorias')
      .update({ telegram_enviado: true })
      .eq('id', recepcaoId);
  }
}

// ── Monitor de OPs atrasadas ──────────────────────────────────

async function monitorarOPsAtrasadas(): Promise<number> {
  try {
    const res = await fetch(
      `${NOMUS_BASE}/ordens`,
      { headers: { Authorization: NOMUS_AUTH, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return 0;
    const raw = await res.json();
    const ordens = (Array.isArray(raw) ? raw : raw.data ?? raw.items ?? []) as Array<Record<string, unknown>>;
    const hoje = new Date().toISOString().split('T')[0];

    const atrasadas = ordens.filter(
      (o) => o.dataHoraEntrega && String(o.dataHoraEntrega).split('T')[0] < hoje
        && o.status !== 'Encerrada' && o.status !== 'Cancelada',
    );

    if (atrasadas.length === 0) return 0;

    // Busca org
    const { data: org } = await supabase.from('organizacoes').select('id').limit(1).single<{ id: string }>();
    if (!org) return 0;

    for (const op of atrasadas.slice(0, 10)) {
      const ref = String(op.codigo ?? op.numeroOP ?? op.id ?? '—');
      const prazo = String(op.dataHoraEntrega ?? op.dataEntrega ?? '—');
      const jaExiste = await supabase
        .from('eventos_autonomos')
        .select('id', { count: 'exact', head: true })
        .eq('workflow_ref', ref)
        .eq('tipo', 'alerta')
        .gt('criado_em', new Date(Date.now() - 4 * 3600 * 1000).toISOString());

      if ((jaExiste.count ?? 0) > 0) continue;

      await supabase.from('eventos_autonomos').insert({
        id_da_organizacao: org.id,
        agente_nome: 'Friday',
        tipo: 'alerta',
        severidade: 'critico',
        workflow_ref: ref,
        step_titulo: 'Produção',
        titulo: `⚠️ OP atrasada: ${ref}`,
        descricao: `Data de entrega: ${prazo} — Status: ${op.status ?? '—'}`,
        dados: {
          ...op,
          mencoes: ['Laivinha'],
          mensagem: `⚠️ OP ${ref} atrasada desde ${prazo} — Status atual: ${op.status ?? '—'}`,
        },
        status: 'pendente',
      });
    }

    return atrasadas.length;
  } catch {
    return 0;
  }
}

// ── Handler principal ─────────────────────────────────────────

Deno.serve(async () => {
  const resultados = { processados: 0, erros: 0, ops_atrasadas: 0 };

  // Buscar eventos pendentes de recepção
  const { data: eventos, error } = await supabase
    .from('eventos_autonomos')
    .select('id, dados')
    .eq('tipo', 'recepcao_materia_prima')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })
    .limit(10);

  if (!error && eventos) {
    for (const evento of eventos) {
      try {
        await processarEvento(evento as EventoRow);
        resultados.processados++;
      } catch (err) {
        console.error(`Erro ao processar evento ${evento.id}:`, err);
        resultados.erros++;
        await supabase
          .from('eventos_autonomos')
          .update({ status: 'erro', resultado: { erro: String(err) } })
          .eq('id', evento.id);
      }
    }
  }

  // Monitorar OPs atrasadas
  resultados.ops_atrasadas = await monitorarOPsAtrasadas();

  return new Response(
    JSON.stringify({ ok: true, ...resultados }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
