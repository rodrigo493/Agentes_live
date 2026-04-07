# Regras de Memória por Setor — Live Universe
**Data:** 2026-04-07
**Setores:** Todos os 17 setores
**Versão:** 1.0.0
**Agente:** Mateus Memória 🧠

---

## Arquitetura Global de Memória

Todos os agentes da Live Universe seguem a mesma hierarquia de 4 camadas:

```
raw_messages        → TTL 30d    → tudo que entra no chat
processed_memory    → TTL 90d    → insights extraídos automaticamente
knowledge_memory    → permanente → conhecimento validado e de alto valor
themes              → permanente → padrões recorrentes agregados
```

**Princípio central:** A memória não é um log — é um ativo. Só sobe de camada o que tem valor operacional comprovado.

---

## Parâmetros Globais de Importância

| Faixa de Score | Categoria | Ação |
|----------------|-----------|------|
| 0.0 – 0.3 | Trivial | Mantido só em raw_messages até TTL |
| 0.3 – 0.5 | Baixo | Elegível para processed_memory (critério adicional exigido) |
| 0.5 – 0.7 | Médio | Promovido a processed_memory automaticamente |
| 0.7 – 0.9 | Alto | Candidato a knowledge_memory (requer validação humana ou recorrência ≥3x) |
| 0.9 – 1.0 | Crítico | Promovido direto a knowledge_memory com flag de revisão obrigatória |

---

## Regras por Setor

---

### 1. agente_solda

**Perfil de memória:** Alta densidade técnica, parâmetros precisos, segurança crítica.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.55
- **Captura:** Todas as mensagens do chat do setor de solda
- **Não capturar:** Mensagens de outros setores que caíram no setor por engano (redirecionar + descartar)

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Parâmetros de soldagem citados pelo operador ou supervisor (amperagem, tensão, velocidade de arame, gás)
  - Registro de não conformidade (NC) com número de rastreabilidade
  - Ocorrência de manutenção de equipamento com data e número de série
  - Dúvida recorrente (mesma pergunta ≥2x no mês)
- **Importância padrão:** 0.65 para parâmetros técnicos; 0.75 para NCs; 0.80 para paradas de equipamento

#### knowledge_memory
- **TTL:** Permanente
- **Revisão obrigatória:** A cada 90 dias ou quando supervisor confirmar mudança de procedimento
- **Itens elegíveis:**
  - Parâmetros de soldagem validados pelo supervisor (com data e assinatura)
  - Causa raiz documentada de NCs recorrentes (≥3 ocorrências)
  - Procedimentos de segurança atualizados formalmente
  - Especificações de consumíveis aprovadas (arame, eletrodo, gás)
  - Soluções definitivas para problemas recorrentes de equipamento

#### Exemplos por tipo

**✅ Deve entrar em knowledge_memory (importance 0.85):**
> "Parâmetro validado pelo Supervisor João em 2026-04-05: MIG em aço 1020 3mm = 100A / 19V / ER70S-6 0.8mm / CO2 puro. Aprovado para reformer série R7."

**✅ Deve entrar em processed_memory (importance 0.70):**
> "NC #2024-S-047 aberta em 04/04: penetração insuficiente na solda do perfil 40x40. Causa provável: amperagem baixa. Aguardando inspeção."

**❌ NÃO deve entrar em memória (importance 0.10):**
> "Bom dia, tudo bem por aí?"

**❌ NÃO deve entrar em memória (importance 0.20):**
> "Você sabe qual o horário do almoço hoje?" (fora de escopo — não capturar)

#### Política de anonimização
- Dados pessoais de colaboradores: **não capturar nome completo** — usar função/cargo apenas
- Exemplo correto: "Supervisor de turno validou" ✅ | "João Carlos Silva validou" ❌

---

### 2. agente_inspecao_qualidade_solda

**Perfil de memória:** Rastreabilidade crítica, padrões de qualidade, histórico de inspeções.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.60

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Resultado de inspeção (aprovado/reprovado) com número de peça/lote
  - Tipo de defeito detectado com frequência ≥2x/semana
  - Equipamento de medição com calibração vencida
  - Critério de aceitação questionado ou revisado

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 90 dias ou quando normativa ABNT/ISO for atualizada
- **Itens elegíveis:**
  - Critérios de aceitação vigentes por tipo de junta soldada
  - Tabela de defeitos classificados por severidade (leve/grave/crítico)
  - Procedimento de inspeção por método (visual, dimensional, líquido penetrante)
  - Histórico de lotes reprovados com causa raiz definitiva

#### Exemplos

**✅ knowledge_memory (importance 0.90):**
> "Critério de aceitação atualizado em 2026-03-01: solda de topo na estrutura do cadillac exige penetração mínima 70% da espessura. Norma interna QS-017."

**✅ processed_memory (importance 0.70):**
> "Lote L2024-047 reprovado em 04/04 — 3 peças com porosidade superficial > 2mm. Retornou para retrabalho no setor de solda."

**❌ NÃO capturar:**
> Dados pessoais de operadores que produziram as peças reprovadas.

---

### 3. agente_lavagem

**Perfil de memória:** Baixa complexidade técnica, procedimentos de higiene e produto químico, rastreamento de lote.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.50

#### processed_memory
- **TTL:** 60 dias (menor que outros — rotatividade alta, baixa densidade)
- **Gatilhos de extração:**
  - Produto químico com validade próxima ou troca de fornecedor
  - Registro de peça danificada no processo de lavagem
  - Lote com reprocessamento necessário

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 180 dias ou troca de produto químico aprovado
- **Itens elegíveis:**
  - Produtos aprovados (FISPQ, concentração, tempo de contato) por tipo de peça
  - Procedimento de descarte de resíduo químico
  - Parâmetros de temperatura e pressão da máquina de lavagem

#### Exemplos

**✅ knowledge_memory (importance 0.80):**
> "Produto aprovado: Detersol Industrial 5L — concentração 2%, temperatura 55°C, tempo 8 min. FISPQ arquivada em engenharia. Vigência: até revisão de fornecedor."

**❌ NÃO capturar:**
> Conversas sobre qualidade de solda que chegaram ao agente errado.

---

### 4. agente_pintura

**Perfil de memória:** Alta densidade técnica, parâmetros de tinta e cabine, rastreamento de lotes por cor/acabamento.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.55

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Parâmetros de cabine (temperatura, umidade, pressão de ar)
  - Tinta com lote fora do padrão (cor, viscosidade, aderência)
  - Defeito de pintura (escorrimento, casca de laranja, bolha)

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 90 dias ou mudança de fornecedor de tinta
- **Itens elegíveis:**
  - Ficha técnica de cada cor aprovada (código RAL/Pantone, viscosidade, ciclo de cura)
  - Parâmetros de cabine por tipo de acabamento (pó, líquido, epóxi)
  - Procedimento de limpeza de bicos/pistola aprovado
  - Causa raiz de defeitos recorrentes com solução definitiva

#### Exemplos

**✅ knowledge_memory (importance 0.88):**
> "Tinta pó epóxi RAL 7035 (cinza claro) — parâmetros aprovados: temperatura cura 180°C por 20min, espessura 60-80μm, aderência Gt0. Fornecedor: Jotafloor. Vigência: lote JF2024-A."

**✅ processed_memory (importance 0.72):**
> "Lote #P-2024-089 com casca de laranja em 12 peças — possível causa: umidade relativa >70% na cabine. Reprocessado após ajuste do exaustor."

---

### 5. agente_inspecao_qualidade_pintura

**Perfil de memória:** Similar ao inspetor de solda — rastreabilidade e critérios de aceitação por acabamento.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.60

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Resultado de inspeção com número de lote
  - Defeito recorrente (≥2x/semana)
  - Medição de espessura fora do range

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 90 dias
- **Itens elegíveis:**
  - Tabela de critérios de aceitação por acabamento e destino da peça
  - Métodos de medição aprovados (espessômetro, teste de aderência, crosshatch)
  - Histórico de lotes reprovados com causa definitiva

#### Exemplos

**✅ knowledge_memory (importance 0.85):**
> "Critério de aceitação tinta pó: espessura 60-80μm (medição magnética), teste de aderência Gt0, sem pontos de ferrugem visíveis. Vigência: norma QP-003 rev.2."

---

### 6. agente_montagem

**Perfil de memória:** Alta densidade operacional, BOM (bill of materials), sequência de montagem, torques.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.55

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Falha de componente identificada durante montagem
  - Desvio de sequência de montagem reportado
  - Torque fora do especificado
  - Componente faltante ou errado em BOM

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 60 dias ou revisão de engenharia do produto
- **Itens elegíveis:**
  - Sequência de montagem aprovada por modelo de equipamento
  - Torques especificados por tipo de fixação e material
  - Lista de ferramentas obrigatórias por etapa
  - Causa raiz de falhas recorrentes na linha de montagem
  - Atualizações de engenharia com data de efetividade

#### Exemplos

**✅ knowledge_memory (importance 0.90):**
> "Sequência de montagem Reformer R7 — rev.3 (2026-01-15): 1) base, 2) trilho deslizante, 3) molas (vermelho/azul/verde), 4) plataforma, 5) polias, 6) headrest. Torque parafuso M8: 22Nm. Aprovada por engenharia."

**✅ processed_memory (importance 0.75):**
> "Polia traseira do Cadillac CAD-5 apresentou folga excessiva em 3 unidades da última semana. Possível lote de buchas fora de spec. Aberta tratativa com compras."

---

### 7. agente_expedicao

**Perfil de memória:** Rastreamento de pedidos, endereços de entrega, transportadoras, SLA.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.50

#### processed_memory
- **TTL:** 60 dias
- **Gatilhos de extração:**
  - Pedido com atraso ou divergência identificada
  - Transportadora com problema recorrente (avaria, atraso)
  - Pedido urgente fora do fluxo padrão

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 90 dias ou mudança de transportadora principal
- **Itens elegíveis:**
  - Transportadoras aprovadas por região com tabela de frete
  - Procedimento de embalagem por tipo de equipamento
  - SLA por categoria de cliente (padrão vs. premium)
  - Regras de dimensionamento de caixa e peso por SKU

#### Exemplos

**✅ knowledge_memory (importance 0.82):**
> "Embalagem aprovada Reformer R7: caixa 2,15m x 0,60m x 0,30m, peso bruto 95kg. Transportadora padrão Sudeste: Jamef. SLA: 3-5 dias úteis."

**⚠️ Dado sensível — anonimizar:**
> Endereços de entrega de clientes: armazenar apenas cidade/estado, nunca endereço completo em knowledge_memory.

---

### 8. agente_compras

**Perfil de memória:** Fornecedores, preços, lead times, histórico de cotações. Dados financeiros sensíveis.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.60

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Cotação recebida com preço unitário e prazo
  - Problema com fornecedor (atraso, qualidade, descontinuação)
  - Pedido urgente com justificativa

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 60 dias (preços mudam frequentemente)
- **Itens elegíveis:**
  - Fornecedores homologados por categoria de insumo (com CNPJ, contato, MOQ)
  - Lead times médios validados por fornecedor
  - Critérios de qualificação e histórico de avaliação de fornecedores
  - Limites de aprovação por cargo (operador, comprador, gerente)

#### Política de dados financeiros
- Valores de contratos e preços unitários: **classification = confidential** — visível apenas para compras e diretoria
- Nunca expor tabelas de preço em respostas de chat — apenas confirmar se está dentro do orçamento aprovado

#### Exemplos

**✅ knowledge_memory (importance 0.85):**
> "Fornecedor homologado: Aço Premium Ltda — aço 1020, tubos 40x40, lead time 7 dias úteis, MOQ 100kg. Avaliação Q1/2026: 9.2/10. Contato: comercial@acopremium.com.br."

**❌ NÃO capturar em knowledge_memory:**
> Valores de cotação individuais sem validação do comprador responsável.

---

### 9. agente_engenharia

**Perfil de memória:** Alta complexidade técnica, desenhos e revisões de produto, especificações de material.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.65

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Revisão de engenharia com número de ECO (Engineering Change Order)
  - Problema de campo reportado via assistência técnica com impacto no produto
  - Ensaio ou teste com resultado fora do esperado

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** Gatilho: nova revisão de ECO ou norma técnica atualizada
- **Itens elegíveis:**
  - Especificações de material aprovadas por componente
  - Histórico de ECOs com data, número e impacto
  - Resultados de ensaios de durabilidade e fadiga aprovados
  - Decisões de projeto com justificativa técnica documentada

#### Exemplos

**✅ knowledge_memory (importance 0.92):**
> "ECO-2026-014 aprovado em 2026-03-10: substituição do perfil 40x40 por 50x50 na base do Reformer R7 a partir do lote L-2026-20. Motivo: ensaio de fadiga reprovado no perfil anterior após 50k ciclos. Aprovado: Eng. de Produto + Qualidade."

---

### 10. agente_assistencia_tecnica

**Perfil de memória:** Histórico de defeitos em campo, soluções aprovadas, base de conhecimento de reparos.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.60

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Chamado de assistência com número, cliente, equipamento e defeito
  - Solução aplicada em campo com resultado
  - Peça de reposição solicitada com SKU

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 90 dias ou quando engenharia emitir boletim técnico
- **Itens elegíveis:**
  - Defeitos recorrentes por modelo com solução definitiva documentada
  - Boletins técnicos emitidos pela engenharia com data de validade
  - Lista de peças de reposição críticas por equipamento
  - Tempo médio de reparo por tipo de defeito

#### Exemplos

**✅ knowledge_memory (importance 0.88):**
> "Defeito recorrente Cadillac CAD-5 (série 2024): folga na polia traseira após 18 meses de uso. Solução: substituir bucha de nylon ref. BN-012 + aperto parafuso M6 a 12Nm. Boletim técnico BT-2025-08."

**⚠️ Anonimização de clientes:**
> Dados de cliente nos chamados: armazenar apenas tipo de cliente (studio / academia / home use) e estado — nunca nome ou CNPJ em knowledge_memory.

---

### 11. agente_comercial

**Perfil de memória:** Pipeline de vendas, histórico de clientes, objeções comuns, argumentos de venda.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.55

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Objeção de cliente com argumento de resposta
  - Negociação com condição especial aprovada
  - Lead perdido com motivo registrado
  - Fechamento de venda com modelo e valor da linha (não exato)

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 60 dias ou campanha comercial
- **Itens elegíveis:**
  - Argumentário de vendas por produto e segmento de cliente
  - Objeções frequentes com contra-argumentos validados pela equipe
  - Condições comerciais padrão aprovadas (prazo, desconto máximo por perfil)
  - Perfis de cliente com maior conversão por canal

#### Política de dados de cliente
- **Nunca** armazenar dados pessoais de leads (CPF, telefone, endereço) em knowledge_memory
- Usar apenas segmento: "fisioterapeuta PF", "studio médio porte SP", etc.

#### Exemplos

**✅ knowledge_memory (importance 0.80):**
> "Objeção recorrente: 'O preço está alto comparado ao concorrente X.' Resposta validada: 'O Live é fabricado no Brasil com aço 4x mais espesso e 5 anos de garantia estrutural. O custo total de propriedade em 5 anos é menor.' Aprovado pelo coordenador comercial."

---

### 12. agente_marketing

**Perfil de memória:** Campanhas, calendário editorial, performance de conteúdo, tendências do setor.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.50

#### processed_memory
- **TTL:** 60 dias
- **Gatilhos de extração:**
  - Post com performance acima de benchmark (alcance, engajamento)
  - Campanha lançada com objetivo e métricas alvo
  - Feedback de cliente sobre conteúdo

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 30 dias (marketing tem ciclo curto)
- **Itens elegíveis:**
  - Diretrizes de tom de voz e visual da marca Live Universe
  - Benchmarks de performance por formato (reels, carrossel, stories)
  - Calendário de datas relevantes para o segmento fitness/saúde
  - Conteúdos de melhor performance histórica com análise de por quê funcionou

#### Exemplos

**✅ knowledge_memory (importance 0.82):**
> "Tom de voz Live Universe: 'Movimentos Inteligentes' — direto, técnico mas acessível, voltado ao profissional de saúde. Evitar: slang excessivo, superlativos sem base, linguagem genérica de lifestyle. Aprovado: Marketing + Diretoria."

**✅ processed_memory (importance 0.65):**
> "Reels do reformer em uso clínico (fisio) tiveram 3x mais engajamento que reels de treino funcional em março/2026. Testar mais conteúdo clínico em abril."

---

### 13. agente_pos_venda

**Perfil de memória:** Satisfação do cliente, reclamações, follow-up pós-entrega, recompra.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.55

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Reclamação com número de protocolo e categoria
  - NPS/CSAT com comentário relevante
  - Pedido de recompra ou indicação registrada
  - Ocorrência de entrega com problema

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 90 dias
- **Itens elegíveis:**
  - Causa raiz das reclamações mais frequentes com ação corretiva adotada
  - Pontos de maior satisfação do cliente (alimentar treinamento do agente)
  - SLA de atendimento pós-venda aprovado por categoria de cliente
  - Scripts de recuperação de cliente insatisfeito

#### Anonimização
- Reclamações: usar apenas segmento de cliente e produto — nunca nome ou CPF em knowledge_memory.

#### Exemplos

**✅ knowledge_memory (importance 0.85):**
> "Causa raiz mais frequente de reclamação (Q1/2026): arranhão na pintura na entrega (28% das ocorrências). Ação corretiva adotada: embalagem reforçada com foam extra nas quinas. Vigência a partir de março/2026."

---

### 14. agente_financeiro

**Perfil de memória:** Dados altamente sensíveis — fluxo de caixa, contas a pagar/receber, faturamento.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.65
- **Acesso restrito:** Apenas usuários com role `financeiro` ou `diretoria`

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Conta a pagar/receber com atraso identificado
  - Divergência em conciliação bancária
  - Solicitação de pagamento urgente fora do calendário

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 30 dias (dados financeiros mudam rápido)
- **Itens elegíveis:**
  - Procedimentos aprovados de aprovação de pagamento por faixa de valor
  - Calendário de obrigações fiscais e datas críticas
  - Regras de conciliação bancária por conta
  - Indicadores-chave de saúde financeira e thresholds de alerta

#### Política de dados sensíveis (LGPD + confidencialidade)
- **Valores absolutos** em knowledge_memory: **proibido** — usar apenas variações percentuais ou ranges
- **Dados de fornecedores PF**: anonimizar — usar apenas categoria de serviço
- **Dados de colaboradores**: nunca armazenar salário, benefícios individuais ou situação funcional

#### Exemplos

**✅ knowledge_memory (importance 0.90) — forma correta:**
> "Procedimento de aprovação: pagamentos até R$5k = autonomia do financeiro; R$5k-50k = diretoria operacional; >R$50k = CEO. Vigência: política PG-003 rev.1."

**❌ NÃO capturar em knowledge_memory:**
> "Saldo atual em conta: R$XXX.XXX,00" — dado pontual, não estrutural

**❌ NÃO capturar:**
> Dados bancários completos, senhas de sistemas, tokens de API de bancos.

---

### 15. agente_contabil

**Perfil de memória:** Lançamentos, obrigações fiscais, legislação tributária. Alta sensibilidade técnica e legal.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.65

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Obrigação fiscal com data limite e status
  - Dúvida fiscal respondida com embasamento legal (manter para reuso)
  - Divergência em SPED ou declaração

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** Gatilho: mudança de legislação tributária relevante (ICMS, IPI, IRPJ)
- **Itens elegíveis:**
  - Regime tributário vigente com principais alíquotas aplicáveis
  - Calendário de obrigações acessórias (SPED, DCTF, ECF) com datas
  - Classificações fiscais aprovadas para os produtos Live Universe (NCM)
  - Interpretações de consultas tributárias formalizadas

#### Política de dados sensíveis (LGPD)
- Dados de funcionários em folha: **nunca capturar** individualmente — apenas totais por categoria
- Dados de sócios/diretores: **não armazenar** em knowledge_memory

#### Exemplos

**✅ knowledge_memory (importance 0.92):**
> "NCM aprovada para Reformer de Pilates: 9506.91.00 (aparelhos para cultura física). ICMS-SP: 7% operações interestaduais com equipamentos esportivos (CFOP 6.102). Vigência: consulta tributária CT-2025-045."

---

### 16. agente_administrativo

**Perfil de memória:** Procedimentos internos, infraestrutura, TI, contratos de serviço, fornecedores de serviço.

#### raw_messages
- **TTL:** 30 dias
- **Threshold de promoção:** importance ≥ 0.50

#### processed_memory
- **TTL:** 90 dias
- **Gatilhos de extração:**
  - Problema de TI com impacto em múltiplos setores
  - Contrato de serviço com data de renovação próxima
  - Procedimento administrativo alterado

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 180 dias
- **Itens elegíveis:**
  - Fornecedores de serviço homologados (TI, manutenção predial, limpeza) com dados de contato
  - Procedimentos administrativos aprovados (solicitação de material, reserva de sala)
  - Senhas de sistemas: **nunca armazenar** — registrar apenas que o acesso existe e onde solicitar

#### Exemplos

**✅ knowledge_memory (importance 0.72):**
> "Fornecedor de TI homologado: Tecnosuporte — contato helpdesk@tecnosuporte.com.br, SLA 4h para crítico, 24h para normal. Contrato renovado até 2027-01-31."

**❌ NÃO armazenar:**
> Credenciais, chaves de licença de software, senhas de roteadores.

---

### 17. agente_rh

**Perfil de memória:** Dados mais sensíveis de todos os setores — dados pessoais de colaboradores, admissões, demissões, desempenho.

#### raw_messages
- **TTL:** 14 dias** (menor TTL de todos — dados pessoais exigem retenção mínima)
- **Threshold de promoção:** importance ≥ 0.70 (threshold mais alto — só o essencial sobe)

#### processed_memory
- **TTL:** 60 dias
- **Gatilhos de extração:**
  - Processo seletivo com número de vaga e cargo
  - Solicitação de treinamento com setor e competência-alvo
  - Ocorrência de afastamento (apenas categoria: saúde / licença / disciplinar — não o motivo individual)

#### knowledge_memory
- **TTL:** Permanente
- **Revisão:** A cada 90 dias ou mudança de legislação trabalhista
- **Itens elegíveis:**
  - Políticas de RH aprovadas (banco de horas, férias, benefícios — texto da política, não dados individuais)
  - Competências técnicas exigidas por cargo (para suporte a seleção)
  - Legislação trabalhista relevante com data da última atualização
  - Procedimentos de admissão e demissão aprovados

#### Política LGPD — Nível Máximo de Proteção
- **Nunca armazenar** em qualquer camada de memória:
  - CPF, RG, dados bancários de colaboradores
  - Histórico de doenças, CID, laudo médico
  - Salários individuais, percentuais de aumento
  - Motivo de demissão ou advertência individual
- **Armazenar apenas dados agregados** ou de política, nunca individuais
- **Base legal exigida para qualquer processamento:** LGPD Art. 7, inciso II (contrato de trabalho)

#### Exemplos

**✅ knowledge_memory (importance 0.88):**
> "Política de banco de horas aprovada (RH-POL-003 rev.2): limite máximo 60h positivas, 20h negativas. Compensação obrigatória no mês subsequente. Vigência: 2026-01-01."

**✅ processed_memory (importance 0.68) — forma correta:**
> "Processo seletivo aberto: 2 vagas de operador de montagem. Perfil: ensino médio completo, experiência mínima 6 meses em linha de produção. Previsão de início: maio/2026."

**❌ NÃO capturar em nenhuma camada:**
> "João da Silva pediu demissão por conflito com supervisor." — dado pessoal + motivo individual

**❌ NÃO capturar:**
> Qualquer identificador pessoal (nome completo, CPF, matrícula) vinculado a situação funcional.

---

## Tabela Resumo por Setor

| Setor | raw TTL | processed TTL | knowledge TTL | Threshold | LGPD Sensível |
|-------|---------|---------------|---------------|-----------|---------------|
| solda | 30d | 90d | Permanente | 0.55 | Baixo |
| inspecao_qualidade_solda | 30d | 90d | Permanente | 0.60 | Baixo |
| lavagem | 30d | 60d | Permanente | 0.50 | Baixo |
| pintura | 30d | 90d | Permanente | 0.55 | Baixo |
| inspecao_qualidade_pintura | 30d | 90d | Permanente | 0.60 | Baixo |
| montagem | 30d | 90d | Permanente | 0.55 | Baixo |
| expedicao | 30d | 60d | Permanente | 0.50 | Médio (endereço cliente) |
| compras | 30d | 90d | Permanente | 0.60 | Médio (preços/contratos) |
| engenharia | 30d | 90d | Permanente | 0.65 | Baixo |
| assistencia_tecnica | 30d | 90d | Permanente | 0.60 | Médio (dados cliente) |
| comercial | 30d | 90d | Permanente | 0.55 | Médio (dados lead/cliente) |
| marketing | 30d | 60d | Permanente | 0.50 | Baixo |
| pos_venda | 30d | 90d | Permanente | 0.55 | Médio (dados cliente) |
| financeiro | 30d | 90d | Permanente | 0.65 | **Alto** (dados financeiros) |
| contabil | 30d | 90d | Permanente | 0.65 | **Alto** (dados fiscais/pessoais) |
| administrativo | 30d | 90d | Permanente | 0.50 | Médio (contratos) |
| rh | **14d** | 60d | Permanente | **0.70** | **Crítico** (dados pessoais) |

---

## Consolidação e Themes

### Consolidação Automática (todos os setores)
- **Frequência:** Semanal (domingo à noite, fora do horário de pico)
- **Critério de consolidação:** processed_memories com similarity > 0.85 são fundidos em 1 entry com note "consolidado em {data}"
- **Crítico para RH:** Consolidação é desativada se envolve dados de pessoa física identificável

### Themes (padrões recorrentes)
Themes são gerados automaticamente quando um padrão aparece em ≥3 sessões diferentes dentro de 30 dias.

**Exemplos de themes por tipo de setor:**
- **Operacional (solda/pintura/montagem):** "pico de NCs às sextas antes de feriado", "dificuldade de parametrização em mudanças de lote"
- **Comercial (comercial/marketing/pos_venda):** "alta resistência de fisios a equipamentos acima de R$15k", "melhor engajamento de conteúdo técnico-clínico"
- **Administrativo (rh/financeiro/contabil):** Themes apenas sobre processos — nunca sobre pessoas

### Limpeza Forçada
- Dados marcados como `classification: confidential` no financeiro/compras: não sobem para themes
- Dados de RH: **nunca geram themes** individuais — apenas themes de processo (ex: "pico de solicitações de férias em janeiro")

---

*Gerado pelo agente Mateus Memória 🧠 — Agentes Fábrica — Live Universe*
*Run ID: 2026-04-07-115128 | Versão: v1*
