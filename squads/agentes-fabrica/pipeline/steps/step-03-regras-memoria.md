---
execution: inline
agent: squads/agentes-fabrica/agents/mateus-memoria
inputFile: squads/agentes-fabrica/output/blueprint-agentes.md
outputFile: squads/agentes-fabrica/output/regras-memoria.md
---

# Step 03: Regras de Memória por Setor

## Context Loading

Carregar estes arquivos antes de executar:
- `squads/agentes-fabrica/output/blueprint-agentes.md` — blueprints dos agentes (Step 2)
- `squads/agentes-fabrica/pipeline/data/research-brief.md` — referências de arquitetura de memória
- `squads/agentes-fabrica/pipeline/data/anti-patterns.md` — anti-patterns de memória

## Instructions

### Process

1. Ler `blueprint-agentes.md` para entender as características de cada setor:
   volume de interações esperado, sensibilidade dos dados, complexidade técnica do vocabulário.
2. Para cada setor presente no blueprint, definir a arquitetura de memória com os 3 tipos:
   raw_messages, processed_memory, knowledge_memory — com TTL, importance threshold e schedule.
3. Calibrar o importance threshold baseado no perfil do setor:
   - Setores técnicos (solda, engenharia): threshold >= 0.6 (conhecimento especializado e valioso)
   - Setores administrativos (rh, financeiro): threshold >= 0.7 (critério mais rigoroso por sensibilidade)
   - Setores operacionais (montagem, expedição): threshold >= 0.5 (volume alto, critério balanceado)
4. Para setores sensíveis (rh, financeiro, contabil): incluir política de anonimização obrigatória.
5. Consolidar em `output/regras-memoria.md`.

## Output Format

```markdown
# Regras de Memória — Agentes por Setor
**Data:** {YYYY-MM-DD}

---

## Setor: {nome}

### Camadas de Memória

| Camada | TTL | Trigger | Critério de Retenção |
|--------|-----|---------|----------------------|
| raw_messages | {N} dias | Automático | {critério} |
| processed_memory | {N} dias | {trigger} | — |
| knowledge_memory | Permanente | Revisão {freq} | {critério de remoção} |

### Importance Scoring

| Faixa | Ação |
|-------|------|
| 0.8-1.0 | Gravar em knowledge_memory |
| 0.5-0.79 | Gravar em processed_memory |
| 0.3-0.49 | Apenas raw_messages |
| < 0.3 | Descartar |

**Threshold knowledge_memory:** {valor}

### Consolidação
- **Schedule:** {horário e frequência}

### Política de Anonimização
{Não aplicável / ou campos + técnica}

### Exemplos de Knowledge_Memory

**DEVEM ser gravados:**
1. {exemplo real do setor}
2. {exemplo real do setor}
3. {exemplo real do setor}

**NÃO DEVEM ser gravados:**
1. {contra-exemplo}
2. {contra-exemplo}
3. {contra-exemplo}

### Owner de Revisão
- **Responsável:** {cargo}
- **Frequência:** {freq}

---
```

## Output Example

Ver `pipeline/data/output-examples.md` — seção "Regras de Memória" para referência de
qualidade, especialmente o tratamento diferenciado entre setor técnico (solda) vs. setor
sensível (rh) em termos de TTL, threshold e anonimização.

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Algum setor não tem TTL numérico especificado para as 3 camadas
2. Setores rh, financeiro ou contabil não têm política de anonimização

## Quality Criteria

- [ ] As 3 camadas estão definidas com TTL para cada setor
- [ ] Importance threshold tem valor numérico específico por setor
- [ ] Schedule de consolidação está especificado
- [ ] Exemplos positivos e negativos de knowledge_memory estão presentes
- [ ] Setores sensíveis têm política de anonimização
- [ ] Owner humano de revisão identificado por cargo
