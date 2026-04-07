---
execution: inline
agent: squads/agentes-fabrica/agents/gabriel-governanca
inputFile: squads/agentes-fabrica/output/regras-memoria.md
outputFile: squads/agentes-fabrica/output/politica-contexto.md
---

# Step 04: Política de Contexto por Setor

## Context Loading

Carregar estes arquivos antes de executar:
- `squads/agentes-fabrica/output/blueprint-agentes.md` — blueprints dos agentes (Step 2)
- `squads/agentes-fabrica/output/regras-memoria.md` — regras de memória (Step 3)
- `squads/agentes-fabrica/pipeline/data/research-brief.md` — referências de governança e RLS

## Instructions

### Process

1. Para cada setor presente nos blueprints, definir políticas para os 3 tipos de contexto:
   chat_agente, workspace e grupos — especificando quais roles têm acesso e em qual nível.
2. Definir políticas de visibilidade para a hierarquia executiva (CEO, Presidente, Conselheiros, Governança):
   - O que cada nível executivo pode ver de cada setor
   - Em qual formato (summaries, KPIs, transações individuais?)
   - Com qual frequência de atualização
3. Gerar RLS policies em SQL válido para cada combinação de setor + tipo de acesso.
   Usar UUID (setor_id) como chave de isolamento, nunca string de nome do setor.
4. Para setores sensíveis (rh, financeiro, contabil): adicionar restrições de mascaramento.
5. Definir política de auditoria: quais eventos geram log, onde, por quanto tempo.
6. Consolidar em `output/politica-contexto.md`.

## Output Format

```markdown
# Políticas de Contexto — Agentes por Setor
**Data:** {YYYY-MM-DD}

---

## Setor: {nome}

### Políticas de Acesso

#### chat_agente
- **Pode iniciar:** roles: [{lista}]
- **Histórico visível:** {regra}
- **Dados visíveis ao agente:** {lista}

#### workspace
- **Pode ver:** roles: [{lista}]
- **Pode postar:** roles: [{lista}]
- **Moderação:** {regra}

#### grupos
- **Pode criar:** {critério}
- **Participação interna:** {critério}
- **Participação externa:** {critério + aprovação}

### Visibilidade Executiva

| Agente | Dados Visíveis | Formato | Frequência |
|--------|---------------|---------|------------|
| agente_ceo | {dados} | {formato} | {freq} |
| agente_presidente | {dados} | {formato} | {freq} |
| conselheiros | {dados} | {formato} | {freq} |
| governanca | {dados} | {formato} | {freq} |

### RLS Policies

```sql
-- {Descrição}
CREATE POLICY "{nome}" ON {tabela}
  FOR {operação} USING ({condição});
```

### Auditoria

| Evento | Tabela de Log | Retenção | Revisor |
|--------|--------------|----------|---------|
{tabela}

---
```

## Output Example

Ver `pipeline/data/output-examples.md` — Exemplo 3 (Política de Contexto — Setor Financeiro)
como referência de formato, nível de detalhe das RLS policies e estrutura de auditoria.

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Algum setor não tem os 3 tipos de contexto (chat, workspace, grupos) definidos
2. RLS policies usam string (nome do setor) em vez de UUID como chave de isolamento

## Quality Criteria

- [ ] Políticas para chat, workspace e grupos definidas por setor
- [ ] Visibilidade executiva especificada para os 4 níveis (CEO, Presidente, Conselheiros, Governança)
- [ ] RLS policies em SQL válido com UUID como chave
- [ ] Setores sensíveis têm restrições adicionais de mascaramento
- [ ] Política de auditoria com eventos, retenção e responsável
