---
task: "Regras de Memória por Setor"
order: 1
input: |
  - blueprint_agentes: Blueprints dos agentes por setor (output/blueprint-agentes.md)
  - research_brief: Referências de arquitetura de memória (pipeline/data/research-brief.md)
output: |
  - regras_memoria: Especificação completa de memória para cada setor processado
    (salvo em squads/agentes-fabrica/output/regras-memoria.md)
---

# Regras de Memória por Setor

Especificar a arquitetura de memória para cada agente de setor: camadas, TTLs, importance scoring,
consolidação e políticas anti-pollution. O output é a referência que guia o developer na
implementação das tabelas e na configuração do sistema de memória.

## Process

1. **Carregar blueprints**: ler `output/blueprint-agentes.md` para entender características de
   cada setor (volume de interações esperado, sensibilidade dos dados, complexidade técnica).
   Ler `pipeline/data/research-brief.md` seção "Arquitetura de Memória".

2. **Para cada setor**, definir as 3 camadas de memória com parâmetros específicos:
   - **raw_messages**: TTL (dias), critério de exclusão antecipada, estrutura de metadados
   - **processed_memory**: TTL, trigger de consolidação (após X sessões ou Y dias), formato do summary
   - **knowledge_memory**: permanente com revisão periódica, importance threshold por tipo de conteúdo, formato de entrada

3. **Calibrar por perfil de setor**: setores técnicos (solda, engenharia) têm importance threshold maior —
   o knowledge é mais especializado e valioso. Setores administrativos (rh, financeiro) têm restrições de
   privacidade mais rigorosas. Setores de interface com cliente (pos_venda, comercial) têm volume maior de
   raw_messages.

4. **Definir exemplos de conhecimento por camada**: para cada setor, listar:
   - 3 exemplos de itens que DEVEM ir para knowledge_memory (alta importância, reutilizável)
   - 3 exemplos de itens que NÃO DEVEM ir para knowledge_memory (baixo valor, transitório)

5. **Definir política de anonimização**: para setores com dados sensíveis (rh, financeiro, contabil),
   especificar quais campos são anonimizados antes de qualquer gravação em memória.

## Output Format

```markdown
# Regras de Memória — Agentes por Setor
**Data:** {YYYY-MM-DD}
**Setores:** {lista}

---

## Setor: {nome_setor}

### Camadas de Memória

| Camada | TTL | Trigger de Expiração | Critério de Retenção Antecipada |
|--------|-----|----------------------|----------------------------------|
| raw_messages | {N} dias | Automático por data | Score < 0.2 ou mensagens de smalltalk |
| processed_memory | {N} dias | {N} dias após consolidação | — |
| knowledge_memory | Permanente | Revisão {frequência} pelo owner | Contradição com item mais recente |

### Importance Scoring

| Faixa | Classificação | Ação |
|-------|--------------|------|
| 0.8 - 1.0 | Alto valor | Gravar em knowledge_memory imediatamente |
| 0.5 - 0.79 | Médio valor | Gravar em processed_memory; consolidar se recorrente |
| 0.3 - 0.49 | Baixo valor | Gravar apenas em raw_messages |
| < 0.3 | Sem valor | Descartar após sessão |

**Threshold mínimo para knowledge_memory:** {valor}
**Critérios que aumentam o score:**
- {critério 1}
- {critério 2}

### Consolidação

- **Schedule:** {horário e frequência}
- **Trigger por volume:** consolidar se raw_messages do setor > {N} mensagens/dia
- **Processo:** LLM local extrai fatos de raw_messages → score → gravar em processed_memory →
  deduplica com knowledge_memory existente → atualiza scores de relevância

### Política de Anonimização

{Para setores sem dados sensíveis: "Não aplicável — dados são técnicos/operacionais sem PII"}
{Para setores com dados sensíveis:}
- Campos anonimizados antes de gravar em qualquer camada: {lista de campos}
- Técnica: {hash, mascaramento parcial, substituição por ID}
- Exceção: {quais dados preservar com qual nível de acesso}

### Exemplos de Knowledge_Memory

**DEVEM ser gravados (importance >= {threshold}):**
1. "{exemplo realista e específico ao setor}"
2. "{exemplo realista e específico ao setor}"
3. "{exemplo realista e específico ao setor}"

**NÃO DEVEM ser gravados:**
1. "{exemplo de item de baixo valor}"
2. "{exemplo de dado transitório}"
3. "{exemplo de smalltalk ou dado pessoal}"

### Owner de Revisão
- **Responsável:** {cargo humano}
- **Frequência:** {semestral/anual/trimestral}
- **Critério de remoção:** {quando remover um item do knowledge_memory}

---
(repetir para cada setor)
```

## Output Example

> Use como referência de qualidade, não como template rígido.

```markdown
# Regras de Memória — Agentes por Setor
**Data:** 2026-04-07
**Setores:** solda, inspecao_qualidade_solda, rh

---

## Setor: solda

### Camadas de Memória

| Camada | TTL | Trigger de Expiração | Critério de Retenção Antecipada |
|--------|-----|----------------------|----------------------------------|
| raw_messages | 30 dias | Automático por data | Score < 0.2 ou mensagem sem insight técnico |
| processed_memory | 90 dias | 90 dias após data de criação | — |
| knowledge_memory | Permanente | Revisão semestral | Substituído por parâmetro mais recente validado |

### Importance Scoring

| Faixa | Classificação | Ação |
|-------|--------------|------|
| 0.8 - 1.0 | Alto valor | Gravar em knowledge_memory imediatamente |
| 0.5 - 0.79 | Médio valor | Gravar em processed_memory; se citado 3x → promover a knowledge |
| 0.3 - 0.49 | Baixo valor | Gravar apenas em raw_messages |
| < 0.3 | Sem valor | Descartar após sessão |

**Threshold mínimo para knowledge_memory:** 0.6
**Critérios que aumentam o score:**
- Parâmetro técnico validado pelo supervisor (+0.3)
- Solução para NC recorrente com causa raiz identificada (+0.4)
- Novo procedimento documentado formalmente (+0.5)

### Exemplos de Knowledge_Memory

**DEVEM ser gravados (importance >= 0.6):**
1. "Parâmetros MIG aço 1020 3mm: 100A/19V/5m/min ER70S-6 — validado supervisor João 2026-03-15"
2. "NC-2025-112: trinca em solda de tubo quadrado 40x40 — causa: velocidade de arame alta (>7m/min). Solução: limitar a 5m/min"
3. "Manutenção preventiva bicos MIG: limpeza a cada 200h operação (conforme manual Fronius)"

**NÃO DEVEM ser gravados:**
1. "Operador perguntou que horas é o almoço" — irrelevante
2. "Boa tarde! Tudo bem?" — smalltalk sem conteúdo técnico
3. "Preciso de ajuda com o computador" — fora do escopo do setor

---

## Setor: rh

### Camadas de Memória

| Camada | TTL | Trigger de Expiração | Critério de Retenção Antecipada |
|--------|-----|----------------------|----------------------------------|
| raw_messages | 15 dias | Automático por data | Qualquer dado pessoal não anonimizado |
| processed_memory | 60 dias | 60 dias após criação | — |
| knowledge_memory | Permanente | Revisão trimestral | Política de RH atualizada substitui a anterior |

### Importance Scoring
**Threshold mínimo para knowledge_memory:** 0.7 (setor com dados sensíveis — critério mais rigoroso)

### Política de Anonimização
- Campos anonimizados antes de gravar em QUALQUER camada: nome_completo, CPF, salario_atual, avaliacao_desempenho
- Técnica: hash SHA-256 para CPF; mascaramento parcial para nome (iniciais); faixas para salário (R$X-Y mil)
- Exceção: cargo e setor preservados pois são dados não-sensíveis necessários para contexto

### Exemplos de Knowledge_Memory

**DEVEM ser gravados (importance >= 0.7):**
1. "Processo de férias: solicitação com 30 dias de antecedência via sistema, aprovação gestor + RH em até 5 dias úteis"
2. "Política de home office: até 2 dias/semana para cargos administrativos, aprovação gestor imediato"
3. "Banco de horas: saldo positivo expira em 90 dias; negativo precisa compensação em 30 dias"

**NÃO DEVEM ser gravados:**
1. "Colaborador {ID} solicitou adiantamento de salário" — dado financeiro pessoal, não gravar
2. "Avaliação de desempenho do colaborador {ID}: nota 3/5" — dado de avaliação, não gravar
3. "CPF do colaborador é 123.456.789-00" — PII, nunca gravar
```

## Quality Criteria

- [ ] As 3 camadas de memória estão definidas com TTL numérico para cada setor
- [ ] Importance threshold tem valor numérico específico (não apenas "padrão")
- [ ] Schedule de consolidação está especificado (horário e frequência)
- [ ] Exemplos positivos e negativos de knowledge_memory estão presentes para cada setor
- [ ] Setores com dados sensíveis (rh, financeiro, contabil) têm política de anonimização explícita
- [ ] Owner humano de revisão está identificado por cargo (não apenas "o responsável")

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Algum setor não tem os 3 tipos de memória especificados com TTL
2. Setores rh, financeiro ou contabil não têm política de anonimização de dados pessoais
