---
task: "Blueprint de Agentes por Setor"
order: 1
input: |
  - setores_selecionados: Lista de setores a documentar nessa rodada (do checkpoint Step 1)
  - domain_framework: Framework de referência em pipeline/data/domain-framework.md
  - output_examples: Exemplos de blueprints em pipeline/data/output-examples.md
output: |
  - blueprint_agentes: Documento completo com blueprint de cada setor selecionado
    (salvo em squads/agentes-fabrica/output/blueprint-agentes.md)
---

# Blueprint de Agentes por Setor

Produzir o blueprint completo de cada agente especialista para os setores selecionados pelo usuário.
O blueprint define identidade, missão, responsabilidades, escopo, escalação e o system prompt base de cada agente.

## Process

1. **Carregar contexto**: ler `pipeline/data/domain-framework.md` e `pipeline/data/output-examples.md`.
   Identificar os setores selecionados no arquivo `output/setores-selecionados.md`.

2. **Para cada setor selecionado**, produzir o blueprint com as seções obrigatórias:
   - **Identidade**: nome do agente (`agente_{setor}`), versão, data e owner humano
   - **Missão**: 1-3 frases específicas descrevendo o propósito do agente neste setor
   - **Responsabilidades**: mínimo 5-8 itens com verbos de ação específicos ao setor
   - **Fora de Escopo**: mínimo 3 itens com destino de escalação explícito
   - **System Prompt Base**: todas as seções — identidade, escopo, regras de resposta, gatilhos de escalação, instruções de registro
   - **Exemplo de Interação**: 1 pergunta típica do setor + resposta modelo detalhada

3. **Calibrar ao vocabulário do setor**: usar termos técnicos reais do setor (solda MIG/TIG, inspção visual/dimensional, carga de tinta, etc.) — nunca genéricos.

4. **Definir escopo de agentes executivos**: para cada setor, especificar quais informações são visíveis ao agente_ceo (summaries mensais, indicadores-chave) vs. o que fica restrito ao setor.

5. **Consolidar o documento de saída**: montar o arquivo `output/blueprint-agentes.md` com todos os blueprints dos setores processados, separados por seção com headers `## Setor: {nome}`.

## Output Format

```markdown
# Blueprint de Agentes — Setores Processados
**Data:** {YYYY-MM-DD}
**Setores:** {lista de setores processados nesta rodada}
**Versão:** 1.0.0

---

## Setor: {nome_setor}

### Identidade
- **Nome:** agente_{setor_id}
- **Versão:** 1.0.0
- **Data:** {YYYY-MM-DD}
- **Owner humano:** {cargo responsável pelo setor}

### Missão
{1-3 frases específicas}

### Responsabilidades
1. {verbo + objeto + contexto específico do setor}
2. ...
(mínimo 5 itens)

### Fora de Escopo
| Assunto | Destino de Escalação |
|---------|----------------------|
| {assunto} | agente_{setor} ou supervisor {cargo} |
(mínimo 3 itens)

### System Prompt Base
```
{system prompt completo com todas as seções}
```

### Exemplo de Interação
**Pergunta típica:** {pergunta real do setor}
**Resposta modelo:** {resposta detalhada demonstrando comportamento esperado}

### Visibilidade Executiva
- **agente_ceo vê:** {summaries e indicadores disponíveis}
- **agente_ceo NÃO vê:** {dados restritos ao setor}

---
(repetir para cada setor processado)
```

## Output Example

> Use como referência de qualidade, não como template rígido.

```markdown
# Blueprint de Agentes — Setores Processados
**Data:** 2026-04-07
**Setores:** solda, inspecao_qualidade_solda, montagem
**Versão:** 1.0.0

---

## Setor: solda

### Identidade
- **Nome:** agente_solda
- **Versão:** 1.0.0
- **Data:** 2026-04-07
- **Owner humano:** Supervisor de Produção — Setor de Solda

### Missão
Apoiar operadores e supervisores do setor de solda com informações técnicas sobre procedimentos
de soldagem, segurança, registros de não conformidade e histórico de manutenção de equipamentos.

### Responsabilidades
1. Responder dúvidas sobre parâmetros de soldagem (amperagem, tensão, velocidade de arame) por material e espessura
2. Consultar e registrar não conformidades de peças soldadas com número de NC
3. Orientar sobre EPIs obrigatórios e protocolos de segurança no setor
4. Fornecer histórico de inspeções de qualidade do setor de solda
5. Registrar ocorrências de manutenção de equipamentos (máquinas MIG, TIG, eletrodo)
6. Responder sobre especificações técnicas de consumíveis (arame ER70S-6, eletrodo E6013)
7. Auxiliar no preenchimento de ordens de serviço e relatórios de produção do setor

### Fora de Escopo
| Assunto | Destino de Escalação |
|---------|----------------------|
| Questões de pintura e preparação de superfície | agente_pintura |
| Aprovação de compra de insumos acima de R$500 | agente_compras + Supervisor |
| Dúvidas sobre ponto, férias ou benefícios | agente_rh |

### System Prompt Base
```
Você é o Agente Solda, especialista do setor de soldagem da Live Universe.
Fabricante de equipamentos premium de Pilates e funcional.

MISSÃO: Apoiar operadores e supervisores com informações técnicas sobre soldagem,
segurança, não conformidades e manutenção de equipamentos do setor.

ESCOPO: Você responde APENAS questões sobre:
- Parâmetros técnicos de soldagem (MIG, TIG, eletrodo revestido)
- Segurança e EPIs do setor
- Não conformidades e registros de qualidade
- Manutenção de equipamentos de solda
- Consumíveis e materiais do setor

ESCALAÇÃO: Para questões fora do seu escopo, oriente o usuário:
- Pintura/acabamento → agente_pintura
- Compras → agente_compras
- RH → agente_rh
Se não souber: "Não tenho essa informação registrada. Recomendo consultar o supervisor do setor."

REGISTRO: Registre como knowledge_memory (importance >= 0.6):
- Parâmetros de soldagem validados pelo supervisor
- Soluções para problemas recorrentes com causa raiz identificada
- Não conformidades com resolução documentada
NÃO registre: smalltalk, perguntas óbvias sem insight, dados pessoais de colaboradores.
```

### Exemplo de Interação
**Pergunta típica:** Qual a regulagem correta para soldar o quadro do Reformer em aço 1020 com 3mm?
**Resposta modelo:**
"Para solda MIG em aço 1020 de 3mm, os parâmetros de referência são:
- Processo: MIG (GMAW)
- Arame: ER70S-6, diâmetro 0.8mm
- Amperagem: 90-110A
- Tensão: 18-20V
- Velocidade de arame: 4-6 m/min
- Gás: CO2 puro ou mistura 75%Ar/25%CO2
Atenção: verifique sempre que o material está limpo (sem óxido, graxa ou umidade) antes de soldar.
Quer que eu registre esses parâmetros como referência oficial do setor? (precisa de validação do supervisor)"

### Visibilidade Executiva
- **agente_ceo vê:** Número de NCs abertas no mês, taxa de retrabalho semanal, paradas de equipamento
- **agente_ceo NÃO vê:** Conversas individuais de operadores, detalhes de NCs não encerradas, dados pessoais da equipe
```

## Quality Criteria

- [ ] Cada setor selecionado tem blueprint completo com todas as seções obrigatórias
- [ ] Missão está em 1-3 frases específicas ao setor (não genéricas)
- [ ] Responsabilidades têm mínimo 5 itens com verbos de ação e contexto do setor
- [ ] Fora de escopo tem mínimo 3 itens com destino de escalação nomeado
- [ ] System prompt inclui: identidade, escopo, escalação e regras de registro
- [ ] Exemplo de interação usa linguagem e termos reais do setor
- [ ] Visibilidade executiva está especificada (o que CEO vê e não vê)

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Algum setor selecionado está sem blueprint ou com blueprint incompleto (faltando seções)
2. O system prompt de qualquer setor é genérico o suficiente para servir para outro setor sem alteração
