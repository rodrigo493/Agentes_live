/**
 * Seed de conhecimento operacional para setores da LIVE
 * Fabricante de equipamentos de Pilates fitness
 *
 * Execução: node scripts/seed-knowledge.js
 */
const { createClient } = require('@supabase/supabase-js');

// Load env from .env.local
require('dotenv').config({ path: '.env.local' });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const KNOWLEDGE_BASE = [
  // ===== SOLDA =====
  {
    sector_slug: 'solda',
    docs: [
      {
        title: 'SOP - Processo de Soldagem MIG/MAG',
        doc_type: 'procedure',
        content: `# Procedimento Operacional Padrão - Soldagem MIG/MAG

## Objetivo
Padronizar o processo de soldagem MIG/MAG para estruturas de equipamentos de Pilates LIVE, garantindo integridade estrutural e acabamento premium.

## EPIs Obrigatórios
- Máscara de solda automática (DIN 9-13)
- Luvas de raspa de couro
- Avental de raspa
- Botina com biqueira de aço
- Protetor auricular

## Parâmetros de Soldagem
- Gás: Mistura 75% Argônio / 25% CO2
- Arame: ER70S-6 (1.0mm para tubos até 3mm, 1.2mm para chapas acima de 3mm)
- Tensão: 18-22V (tubos finos), 22-28V (estruturas)
- Velocidade de arame: 4-8 m/min conforme espessura

## Sequência de Soldagem
1. Verificar gabarito e alinhamento das peças
2. Pontear nos pontos indicados no desenho técnico
3. Verificar esquadro com goniômetro
4. Executar cordão contínuo nos pontos indicados
5. Resfriar naturalmente (NUNCA usar água)
6. Inspecionar visualmente cada cordão
7. Marcar peça com identificação do soldador

## Critérios de Qualidade
- Cordão uniforme, sem porosidade
- Sem respingos no tubo acabado
- Penetração mínima de 80% da espessura
- Sem trincas ou mordeduras
- Alinhamento dentro da tolerância de ±1mm

## Não Conformidades
- Peça fora de esquadro: RETRABALHAR antes de prosseguir
- Porosidade no cordão: ESMERILHAR e ressoldar
- Respingos: REMOVER com espátula antes de enviar para Lavagem`,
        tags: ['soldagem', 'MIG', 'MAG', 'procedimento', 'qualidade'],
      },
      {
        title: 'Regras de Segurança - Setor de Solda',
        doc_type: 'procedure',
        content: `# Regras de Segurança - Setor de Solda

## Regras Inegociáveis
1. NUNCA soldar sem máscara — risco de queimadura de córnea
2. NUNCA soldar perto de materiais inflamáveis
3. Sempre verificar aterramento do equipamento antes de iniciar
4. Manter extintor ABC a no máximo 5 metros da estação
5. Biombos de proteção devem estar posicionados SEMPRE

## Ventilação
- Exaustores devem estar ligados durante toda a operação
- Em caso de fumaça excessiva, parar e verificar ventilação
- Trabalho em espaço confinado requer PT específica

## Emergências
- Queimadura: lavar com água corrente por 15 min, acionar enfermaria
- Choque elétrico: desligar fonte, não tocar na vítima, acionar CIPA
- Incêndio: usar extintor, acionar alarme, evacuar se necessário`,
        tags: ['segurança', 'EPI', 'emergência', 'solda'],
      },
    ],
  },

  // ===== PINTURA =====
  {
    sector_slug: 'pintura',
    docs: [
      {
        title: 'SOP - Processo de Pintura Eletrostática',
        doc_type: 'procedure',
        content: `# Procedimento Operacional Padrão - Pintura Eletrostática

## Objetivo
Garantir acabamento premium nos equipamentos LIVE com pintura eletrostática a pó, sustentando o posicionamento premium da marca.

## Preparação da Superfície
1. Receber peça do setor de Lavagem (deve estar 100% limpa e seca)
2. Verificar ausência de oxidação, óleo ou resíduos
3. Se houver imperfeição: DEVOLVER para Lavagem com etiqueta de NC
4. Pendurar peças nos ganchos com espaçamento mínimo de 10cm

## Aplicação
- Pistola eletrostática: 60-80 kV
- Distância: 15-25 cm da peça
- Camada: 60-80 microns (medir com medidor de espessura)
- Cores padrão LIVE: Preto Fosco (RAL 9005), Branco Gelo (RAL 9010), Grafite (RAL 7016)
- Cores especiais: apenas sob aprovação da Engenharia

## Cura no Forno
- Temperatura: 180-200°C
- Tempo: 15-20 minutos após atingir temperatura
- NUNCA abrir forno antes do tempo — compromete aderência

## Inspeção
- Verificar uniformidade da cor
- Medir espessura em 3 pontos por peça
- Teste de aderência (corte em X) a cada lote
- Registrar lote, cor, espessura e resultado no sistema

## Retrabalho
- Falha de aderência: lixar, reaplicar e recurar
- Escorrimento: peça recebe jateamento e reinicia processo`,
        tags: ['pintura', 'eletrostática', 'qualidade', 'acabamento', 'premium'],
      },
    ],
  },

  // ===== MONTAGEM =====
  {
    sector_slug: 'montagem',
    docs: [
      {
        title: 'SOP - Montagem de Equipamentos Pilates',
        doc_type: 'procedure',
        content: `# Procedimento Operacional Padrão - Montagem

## Objetivo
Montar equipamentos LIVE com precisão, garantindo funcionalidade, segurança e experiência premium para o cliente final.

## Checklist Pré-Montagem
- [ ] Todas as peças do kit conferidas vs. lista de materiais
- [ ] Peças pintadas sem danos de transporte
- [ ] Ferragens e acessórios separados por estação
- [ ] Desenho técnico atualizado na estação

## Sequência de Montagem (Reformer Classic)
1. Montar estrutura principal (frame)
2. Instalar trilhos de deslizamento
3. Montar carrinho móvel e verificar rolamento
4. Instalar sistema de molas (5 configurações de resistência)
5. Montar apoios de pé e cabeça
6. Instalar estofados (verificar costura e fixação)
7. Montar acessórios: alças, cordas, barra de pés

## Torques Especificados
- Parafusos estruturais M8: 25 Nm
- Parafusos M6 de fixação: 12 Nm
- Parafusos de ajuste: manual (sem torquímetro)
- SEMPRE usar torquímetro para parafusos estruturais

## Teste Funcional
- Carrinho deve deslizar suavemente em toda a extensão
- Molas devem engatar nas 5 posições sem folga
- Nenhum ruído metálico durante movimentação
- Peso de teste: 120kg por 30 segundos em posição central

## Embalagem
- Envolver com plástico bolha em todas as superfícies pintadas
- Proteger cantos com espuma
- Etiqueta com: modelo, cor, lote, data, montador`,
        tags: ['montagem', 'reformer', 'pilates', 'qualidade', 'torque'],
      },
    ],
  },

  // ===== LAVAGEM =====
  {
    sector_slug: 'lavagem',
    docs: [
      {
        title: 'SOP - Lavagem e Preparação de Superfície',
        doc_type: 'procedure',
        content: `# Procedimento Operacional Padrão - Lavagem

## Objetivo
Preparar peças soldadas para pintura, removendo contaminantes e garantindo aderência perfeita.

## Etapas do Processo
1. **Desengraxe**: banho alcalino a 60°C por 5 minutos
2. **Enxágue 1**: água corrente
3. **Decapagem**: banho ácido fosfórico por 3 minutos
4. **Enxágue 2**: água corrente
5. **Fosfatização**: banho de fosfato de zinco por 5 minutos
6. **Enxágue final**: água deionizada
7. **Secagem**: forno a 120°C por 10 minutos

## Controles Obrigatórios
- pH dos banhos: verificar a cada 2 horas
- Temperatura: monitorar continuamente
- Concentração de produtos: dosar conforme ficha técnica
- Registrar todos os controles no formulário de banho

## Critérios de Aprovação
- Peça 100% livre de óleo, oxidação e resíduos
- Camada de fosfato uniforme (tom cinza fosco)
- Secagem completa antes de enviar para Pintura

## Descarte de Efluentes
- Efluentes tratados na ETE antes de descarte
- Lodo de fosfato: coleta por empresa licenciada
- Registrar volumes no controle ambiental`,
        tags: ['lavagem', 'preparação', 'superfície', 'fosfatização', 'qualidade'],
      },
    ],
  },

  // ===== EXPEDIÇÃO =====
  {
    sector_slug: 'expedicao',
    docs: [
      {
        title: 'SOP - Expedição e Logística',
        doc_type: 'procedure',
        content: `# Procedimento Operacional Padrão - Expedição

## Fluxo de Expedição
1. Receber equipamento montado e embalado da Montagem
2. Conferir checklist de qualidade assinado
3. Verificar embalagem: sem danos, etiqueta legível
4. Gerar NF-e no ERP (Nomus)
5. Separar por transportadora/rota
6. Carregar veículo com empilhadeira (carga máxima respeitada)
7. Registrar saída: NF, transportadora, placa, horário

## Regras de Carregamento
- Equipamentos na vertical, nunca empilhados
- Amarração com cintas de nylon em 4 pontos
- Peso máximo por palete: 500kg
- Proteger contra chuva (lona obrigatória)

## Prazos
- Pedidos nacionais: expedição em até 48h após montagem
- Pedidos internacionais: documentação aduaneira com 72h de antecedência
- Sempre confirmar endereço de entrega com Comercial antes de despachar

## Rastreamento
- Enviar código de rastreio ao Comercial no mesmo dia
- Atualizar status no ERP: "Despachado"
- Em caso de atraso da transportadora: comunicar Comercial imediatamente`,
        tags: ['expedição', 'logística', 'NF-e', 'transporte', 'rastreamento'],
      },
    ],
  },

  // ===== COMPRAS =====
  {
    sector_slug: 'compras',
    docs: [
      {
        title: 'Política de Compras e Fornecedores',
        doc_type: 'document',
        content: `# Política de Compras - LIVE

## Princípios
- Qualidade vem antes do preço — nosso produto sustenta posicionamento premium
- Mínimo 3 cotações para compras acima de R$ 5.000
- Fornecedores devem ser homologados pela Engenharia

## Materiais Críticos
- Tubos de aço: ASTM A500 grau B (fornecedor homologado)
- Molas de resistência: especificação LIVE proprietária
- Estofados: espuma D33, courvin automotivo premium
- Rolamentos: SKF ou NSK (sem substitutos)
- Tintas: Akzo Nobel ou Tiger (certificação Qualicoat)

## Processo de Compra
1. Requisição do setor solicitante (aprovação do gestor)
2. Cotação com fornecedores homologados
3. Aprovação conforme alçada:
   - Até R$ 2.000: Gestor do setor
   - R$ 2.000-10.000: Financeiro
   - Acima de R$ 10.000: Diretoria
4. Emissão de pedido de compra
5. Acompanhamento de entrega
6. Conferência na entrada (qualidade + quantidade)

## Lead Times Padrão
- Tubos de aço: 5-7 dias úteis
- Molas: 15-20 dias úteis (sob encomenda)
- Tintas: 3-5 dias úteis
- Estofados: 10-15 dias úteis`,
        tags: ['compras', 'fornecedores', 'materiais', 'política', 'aprovação'],
      },
    ],
  },

  // ===== COMERCIAL =====
  {
    sector_slug: 'comercial',
    docs: [
      {
        title: 'Processo Comercial - Venda Consultiva LIVE',
        doc_type: 'document',
        content: `# Processo Comercial - LIVE

## Filosofia de Vendas
"Só faz sentido crescer se o cliente cresce junto."
- NÃO vendemos equipamento isolado — vendemos método + posicionamento + resultado
- Preferimos perder uma venda do que comprometer o resultado do cliente
- O método e o posicionamento do cliente vêm antes do volume

## Funil de Vendas
1. **Prospecção**: studios de Pilates e academias premium
2. **Qualificação**: entender se o cliente tem perfil LIVE
3. **Diagnóstico**: visita ou call para entender necessidades
4. **Proposta**: equipamentos + método + suporte
5. **Negociação**: nunca baixar preço, agregar valor
6. **Fechamento**: contrato + prazo de entrega
7. **Pós-venda**: acompanhamento de implantação

## Produtos Principais
- Reformer Classic LIVE
- Reformer Pro LIVE
- Cadillac/Trapézio LIVE
- Combo Chair LIVE
- Barrel (Ladder + Step)
- Acessórios e peças de reposição

## Precificação
- Tabela de preços atualizada mensalmente
- Desconto máximo: 10% para compras acima de 5 unidades
- Condições especiais: apenas com aprovação da Diretoria
- Frete: CIF para capitais, FOB para interior

## Exportação
- Mercados prioritários: América Latina, Europa, EUA
- Documentação: responsabilidade do Comercial Internacional
- Certificações necessárias por país: consultar Engenharia`,
        tags: ['comercial', 'vendas', 'método', 'pilates', 'exportação'],
      },
    ],
  },

  // ===== ENGENHARIA =====
  {
    sector_slug: 'engenharia',
    docs: [
      {
        title: 'Padrões de Engenharia - Desenvolvimento de Produto',
        doc_type: 'document',
        content: `# Padrões de Engenharia - LIVE

## Princípios de Design
- Segurança estrutural é inegociável
- Design deve sustentar posicionamento premium
- Biomecânica do Pilates orienta todas as dimensões
- Método proprietário LIVE define especificações

## Materiais Padrão
- Estrutura: Aço carbono SAE 1020, tubos retangulares e redondos
- Acabamento: pintura eletrostática a pó (60-80 microns)
- Estofados: espuma D33, courvin automotivo, costura reforçada
- Molas: aço especial com 5 níveis de resistência
- Rolamentos: SKF/NSK para carrinho deslizante

## Tolerâncias
- Dimensões estruturais: ±1mm
- Ângulos: ±0.5°
- Alinhamento de trilhos: ±0.3mm
- Peso do equipamento: ±2%

## Testes Obrigatórios
- Teste de carga estática: 3x carga nominal por 1 hora
- Teste de fadiga: 50.000 ciclos
- Teste de corrosão: 500h em câmara de névoa salina
- Teste ergonômico: validação com instrutores certificados

## Documentação
- Cada produto deve ter: desenho técnico, lista de materiais, roteiro de fabricação
- Revisões controladas: só Engenharia altera desenhos
- Alterações em campo: proibidas sem ECR (Engineering Change Request)`,
        tags: ['engenharia', 'projeto', 'especificação', 'materiais', 'testes'],
      },
    ],
  },

  // ===== QUALIDADE SOLDA =====
  {
    sector_slug: 'inspecao_qualidade_solda',
    docs: [
      {
        title: 'Critérios de Inspeção - Soldagem',
        doc_type: 'procedure',
        content: `# Critérios de Inspeção de Qualidade - Soldagem

## Inspeção Visual (100% das peças)
- Cordão uniforme e contínuo
- Sem porosidade visível
- Sem trincas, mordeduras ou inclusões
- Respingos removidos
- Alinhamento conforme gabarito (±1mm)

## Inspeção Dimensional
- Conferir com paquímetro e goniômetro
- Medidas críticas marcadas no desenho técnico
- Registrar no formulário de inspeção

## Critérios de Rejeição
- Qualquer trinca = REJEITAR
- Porosidade > 2mm = REJEITAR
- Mordedura > 0.5mm = REJEITAR
- Fora de esquadro > 1° = REJEITAR
- Penetração < 80% = REJEITAR

## Rastreabilidade
- Cada peça recebe etiqueta com: lote, soldador, data, inspetor
- Peças rejeitadas: segregar em área vermelha com etiqueta de NC
- NC deve ser registrada no sistema e comunicada ao gestor do setor`,
        tags: ['qualidade', 'inspeção', 'solda', 'critérios', 'NC'],
      },
    ],
  },

  // ===== RH =====
  {
    sector_slug: 'rh',
    docs: [
      {
        title: 'Cultura e Valores LIVE - Guia do Colaborador',
        doc_type: 'manual',
        content: `# Cultura e Valores LIVE - Guia do Colaborador

## Nossa Visão
Até 2030, ser a marca brasileira com maior presença internacional de vendas de aparelhos de Pilates fitness.

## Nossa Missão
Desenvolver equipamentos de alta performance integrados a um método proprietário, que ajuda studios de Pilates e academias a se posicionarem melhor, cobrarem mais e terem resultados superiores.

## Nossos Valores

### 1. Só faz sentido crescer se o cliente cresce junto
- Não vendemos o que não gera resultado real
- Preferimos perder uma venda do que comprometer o resultado do cliente

### 2. Qualidade não é argumento de venda. É obrigação
- Não abrimos mão de engenharia, segurança e durabilidade
- O produto precisa sustentar o posicionamento premium

### 3. Preferimos fazer menos, com profundidade
- Trabalhamos com método proprietário
- Valorizamos processos claros e replicáveis

### 4. Crescer não vale a pena se destrói pessoas
- Respeitamos família, equipe e relações
- Não toleramos ambientes tóxicos
- Liderança é exemplo, não imposição

### 5. Verdade, dignidade e responsabilidade
- Honestidade vem antes do resultado
- O bem comum orienta decisões difíceis

### 6. Aprendemos rápido e corrigimos rota
- O ego não pode travar decisões
- Crescimento exige maturidade

## Conduta Esperada
- Respeito entre todos os níveis hierárquicos
- Comunicação clara e direta
- Compromisso com prazos e qualidade
- Cuidado com ferramentas e equipamentos
- Uso correto de EPIs (sem exceção)`,
        tags: ['cultura', 'valores', 'RH', 'colaborador', 'conduta'],
      },
    ],
  },

  // ===== FINANCEIRO =====
  {
    sector_slug: 'financeiro',
    docs: [
      {
        title: 'Processos Financeiros - Contas a Pagar e Receber',
        doc_type: 'document',
        content: `# Processos Financeiros - LIVE

## Contas a Receber
- Faturamento conforme pedido aprovado pelo Comercial
- Prazo padrão: 28 dias (boleto ou PIX)
- Condições especiais: aprovação da Diretoria
- Cobrança: 3 tentativas antes de enviar para jurídico
- Inadimplência > 60 dias: bloquear novos pedidos

## Contas a Pagar
- Pagamentos apenas com NF validada
- Conferência: NF vs. pedido de compra vs. entrada física
- Pagamento até o vencimento (sem exceção)
- Aprovações conforme alçada definida em Compras

## Fluxo de Caixa
- Projeção semanal atualizada toda segunda-feira
- Alerta ao CEO se caixa projetado < 30 dias de operação
- Investimentos: apenas com aprovação da Presidência

## Integração com ERP (Nomus)
- Todas as operações financeiras registradas no Nomus
- Conciliação bancária diária
- Relatórios gerenciais: DRE mensal até dia 10`,
        tags: ['financeiro', 'contas', 'fluxo de caixa', 'Nomus', 'DRE'],
      },
    ],
  },
];

async function seedKnowledge() {
  // Get sector IDs
  const { data: sectors } = await admin.from('sectors').select('id, slug').eq('is_active', true);
  const sectorMap = Object.fromEntries((sectors ?? []).map(s => [s.slug, s.id]));

  let totalDocs = 0;
  let totalMemory = 0;
  let totalProcessed = 0;

  for (const sectorData of KNOWLEDGE_BASE) {
    const sectorId = sectorMap[sectorData.sector_slug];
    if (!sectorId) {
      console.log(`SKIP: setor ${sectorData.sector_slug} não encontrado`);
      continue;
    }

    for (const doc of sectorData.docs) {
      // 1. Camada 1: knowledge_docs
      const { data: kDoc, error: e1 } = await admin.from('knowledge_docs').insert({
        sector_id: sectorId,
        title: doc.title,
        content: doc.content,
        doc_type: doc.doc_type,
        tags: doc.tags,
        uploaded_by: '0dda052f-91cc-4e63-a53d-33b81186d1fe', // Rodrigo Siqueira (master_admin)
        is_active: true,
      }).select('id').single();

      if (e1) { console.log(`ERRO doc ${doc.title}: ${e1.message}`); continue; }
      totalDocs++;

      // 2. Camada 2: processed_memory
      const { data: pMem, error: e2 } = await admin.from('processed_memory').insert({
        sector_id: sectorId,
        source_type: 'knowledge_doc',
        source_id: kDoc.id,
        content: doc.content,
        summary: doc.title,
        tags: doc.tags,
        relevance_score: 0.85,
        processing_status: 'completed',
        is_active: true,
      }).select('id').single();

      if (!e2) totalProcessed++;

      // 3. Camada 3: knowledge_memory (para procedures e manuals)
      if (doc.doc_type === 'procedure' || doc.doc_type === 'manual') {
        const { error: e3 } = await admin.from('knowledge_memory').insert({
          sector_id: sectorId,
          source_processed_id: pMem?.id,
          title: doc.title,
          content: doc.content,
          category: doc.doc_type === 'procedure' ? 'procedure' : 'operational',
          confidence_score: 0.9,
          validation_status: 'human_validated',
          tags: doc.tags,
          is_active: true,
        });

        if (!e3) totalMemory++;
      }
    }

    console.log(`OK: ${sectorData.sector_slug} (${sectorData.docs.length} docs)`);
  }

  console.log(`\nResumo: ${totalDocs} docs | ${totalProcessed} processed | ${totalMemory} knowledge_memory`);
}

seedKnowledge().catch(console.error);
