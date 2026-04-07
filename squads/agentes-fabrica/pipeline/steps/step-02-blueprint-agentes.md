---
execution: inline
agent: squads/agentes-fabrica/agents/artur-arquitetura
inputFile: squads/agentes-fabrica/output/setores-selecionados.md
outputFile: squads/agentes-fabrica/output/blueprint-agentes.md
---

# Step 02: Blueprint de Agentes por Setor

## Context Loading

Carregar estes arquivos antes de executar:
- `squads/agentes-fabrica/output/setores-selecionados.md` — setores selecionados no checkpoint
- `squads/agentes-fabrica/pipeline/data/domain-framework.md` — framework de arquitetura de agentes
- `squads/agentes-fabrica/pipeline/data/output-examples.md` — exemplos de blueprints de referência
- `squads/agentes-fabrica/_memory/company.md` (via `_opensquad/_memory/company.md`) — contexto Live Universe

## Instructions

### Process

1. Ler `setores-selecionados.md` para identificar quais setores processar nesta rodada.
2. Para cada setor selecionado, criar o blueprint completo seguindo o formato especificado
   no task file `agents/artur-arquitetura/tasks/blueprint-agentes-setor.md`.
3. Usar os exemplos em `output-examples.md` como referência de qualidade e profundidade.
4. Calibrar o vocabulário técnico ao setor (termos reais de fábrica, não genéricos).
5. Consolidar todos os blueprints em um único arquivo `output/blueprint-agentes.md`.

## Output Format

```markdown
# Blueprint de Agentes — Setores Processados
**Data:** {YYYY-MM-DD}
**Setores:** {lista}
**Versão:** 1.0.0

---

## Setor: {nome}

### Identidade
- **Nome:** agente_{setor_id}
- **Versão:** 1.0.0
- **Data:** {data}
- **Owner humano:** {cargo}

### Missão
{1-3 frases específicas}

### Responsabilidades
1. {item específico ao setor}
...

### Fora de Escopo
| Assunto | Destino |
|---------|---------|
{tabela}

### System Prompt Base
{prompt completo}

### Exemplo de Interação
**Pergunta:** {pergunta real}
**Resposta modelo:** {resposta detalhada}

### Visibilidade Executiva
- **agente_ceo vê:** {dados}
- **agente_ceo NÃO vê:** {dados}

---
(repetir para cada setor)
```

## Output Example

Ver `pipeline/data/output-examples.md` — Exemplo 1 (Blueprint do Agente de Solda) e
Exemplo 2 (Blueprint do Agente de Marketing) como referência de qualidade e profundidade esperada.

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Algum setor selecionado não tem blueprint completo (com todas as seções obrigatórias)
2. O system prompt de qualquer setor é genérico o suficiente para servir a outro setor sem alteração

## Quality Criteria

- [ ] Todos os setores selecionados têm blueprint completo
- [ ] Cada missão está em 1-3 frases específicas ao setor
- [ ] Cada blueprint tem responsabilidades com mínimo 5 itens com verbos de ação
- [ ] Cada blueprint tem fora-de-escopo com mínimo 3 itens e destino de escalação
- [ ] Cada system prompt inclui escopo, escalação e regras de registro de memória
- [ ] Cada blueprint tem exemplo de interação com linguagem do setor
