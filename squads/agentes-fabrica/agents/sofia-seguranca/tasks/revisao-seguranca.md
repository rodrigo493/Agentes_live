---
task: "Revisão de Segurança"
order: 1
input: |
  - blueprint_agentes: Blueprints dos agentes (output/blueprint-agentes.md)
  - regras_memoria: Regras de memória (output/regras-memoria.md)
  - politica_contexto: Políticas de contexto e RLS (output/politica-contexto.md)
  - especificacao_integracao: Spec de integração (output/especificacao-integracao.md)
  - anti_patterns: Anti-patterns do domínio (pipeline/data/anti-patterns.md)
output: |
  - revisao_seguranca: Relatório de segurança com veredicto e itens a corrigir
    (salvo em squads/agentes-fabrica/output/revisao-seguranca.md)
---

# Revisão de Segurança

Revisar todos os outputs dos agentes anteriores em busca de vulnerabilidades de segurança,
brechas de acesso, riscos de memory pollution e falhas de isolamento entre setores.
Emitir veredicto: APROVADO, APROVADO COM RESSALVAS ou REPROVADO.

## Process

1. **Carregar todos os outputs**: ler os 4 arquivos de output + anti-patterns.
   Identificar setores processados e quais têm dados sensíveis (rh, financeiro, contabil).

2. **Verificar OWASP Agentic Top 10** nos outputs — focar nos 6 mais relevantes para este contexto:
   - Agent goal hijacking (escopo mal definido permite manipulação)
   - Memory and context poisoning (falhas nas regras de what-to-record)
   - Insecure inter-agent communication (vazamento entre setores)
   - Rogue agent behavior (agente executivo com acesso além do especificado)
   - Sensitive data exposure (dados pessoais/financeiros sem anonimização)
   - Audit log gaps (eventos não auditados)

3. **Revisar blueprints setor a setor** verificando:
   - Escopo bem definido com lista explícita de fora-de-escopo
   - System prompt com instrução de escalação para casos fora do escopo
   - Sem prompt genérico que pode ser manipulado por prompt injection

4. **Revisar regras de memória** verificando:
   - Importance threshold documentado — não vago
   - Dados sensíveis têm política de anonimização
   - TTL adequado ao tipo de dado (dados sensíveis com TTL mais curto)

5. **Revisar políticas de contexto** verificando:
   - RLS policies implementáveis (SQL válido, não apenas intenção)
   - Isolamento entre setores garantido por mecanismo técnico
   - Visibilidade executiva limitada a summaries (não dados brutos)

6. **Revisar especificação de integração** verificando:
   - Endpoints validam setor_id para evitar acesso cross-setor
   - Graceful degradation não vaza informações em mensagens de erro
   - Views executivas não expõem dados individuais

7. **Emitir veredicto** com relatório estruturado por nível de severidade.

## Output Format

```markdown
# Relatório de Revisão de Segurança
**Data:** {YYYY-MM-DD}
**Setores revisados:** {lista}
**Veredicto:** {APROVADO | APROVADO COM RESSALVAS | REPROVADO}

---

## Resumo Executivo

{2-4 frases: principais achados, veredicto e próximos passos}

---

## Itens CRÍTICOS (bloqueiam deploy)

{Se vazio: "Nenhum item crítico identificado."}

### CRÍTICO-01: {título do problema}
- **Onde:** {arquivo, setor, seção específica}
- **Problema:** {descrição clara do que está errado}
- **Impacto:** {o que pode acontecer se não for corrigido}
- **Correção:** {ação específica para resolver}

---

## Itens GRAVES (devem ser corrigidos antes de produção)

{Se vazio: "Nenhum item grave identificado."}

### GRAVE-01: {título}
- **Onde:** {localização}
- **Problema:** {descrição}
- **Impacto:** {impacto}
- **Correção:** {ação}

---

## Observações (melhorias recomendadas)

{Se vazio: "Nenhuma observação adicional."}

### OBS-01: {título}
- **Onde:** {localização}
- **Sugestão:** {melhoria recomendada}

---

## Checklist OWASP Agentic Top 10

| Risco | Status | Observação |
|-------|--------|------------|
| Agent goal hijacking | {OK / RISCO / CRÍTICO} | {nota} |
| Memory and context poisoning | {status} | {nota} |
| Insecure inter-agent communication | {status} | {nota} |
| Rogue agent behavior | {status} | {nota} |
| Sensitive data exposure | {status} | {nota} |
| Audit log gaps | {status} | {nota} |

---

## Resultado por Setor

| Setor | Status | Itens Pendentes |
|-------|--------|----------------|
| {setor} | {OK / RESSALVAS / REPROVADO} | {lista resumida ou "—"} |

---

## Próximos Passos

{Lista de ações, responsáveis e ordem de prioridade}
```

## Output Example

> Use como referência de qualidade, não como template rígido.

```markdown
# Relatório de Revisão de Segurança
**Data:** 2026-04-07
**Setores revisados:** solda, inspecao_qualidade_solda, rh, financeiro, marketing
**Veredicto:** APROVADO COM RESSALVAS

---

## Resumo Executivo

A revisão identificou 0 itens CRÍTICOS e 2 itens GRAVES. Os blueprints operacionais (solda,
inspeção) estão bem especificados com escopo claro e escalação definida. Os setores sensíveis
(rh, financeiro) têm políticas de anonimização adequadas. Os itens GRAVES devem ser corrigidos
antes do deploy em produção.

---

## Itens CRÍTICOS

Nenhum item crítico identificado.

---

## Itens GRAVES

### GRAVE-01: RLS de isolamento financeiro usa string em vez de UUID
- **Onde:** `output/politica-contexto.md`, seção Setor financeiro, RLS policy "financeiro_workspace_isolation"
- **Problema:** A policy usa `setor_id = 'financeiro'` (string) como condição de isolamento.
  Strings são mutáveis — se o setor for renomeado, a policy quebra silenciosamente.
- **Impacto:** Após renomeação do setor, o isolamento falha e dados financeiros ficam acessíveis para outros setores.
- **Correção:** Usar UUID: `setor_id = (SELECT id FROM sectors WHERE slug = 'financeiro')` ou
  parametrizar via `app.setor_id` setting.

### GRAVE-02: Agente de marketing sem instrução de escalação para dados de cliente
- **Onde:** `output/blueprint-agentes.md`, seção Setor marketing, system prompt
- **Problema:** O system prompt do agente_marketing não inclui instrução sobre como tratar
  dados de leads e clientes (nome, contato, histórico de compra). Pode gravar PII em knowledge_memory.
- **Impacto:** LGPD violation — dados pessoais de clientes/leads em memória sem política de anonimização.
- **Correção:** Adicionar ao system prompt: "NUNCA registre nome, contato ou dados pessoais de clientes
  em memória. Registre apenas insights de campanha e padrões de comportamento anonimizados."

---

## Checklist OWASP Agentic Top 10

| Risco | Status | Observação |
|-------|--------|------------|
| Agent goal hijacking | OK | Todos os agentes têm escopo bem definido com lista de fora-de-escopo |
| Memory and context poisoning | OK | Importance scoring e exemplos negativos definidos |
| Insecure inter-agent communication | RISCO | GRAVE-01: RLS com string em vez de UUID |
| Rogue agent behavior | OK | Agentes executivos limitados a views agregadas |
| Sensitive data exposure | RISCO | GRAVE-02: agente_marketing sem regra para PII de clientes |
| Audit log gaps | OK | Auditoria definida para todos os acessos sensíveis |

---

## Resultado por Setor

| Setor | Status | Itens Pendentes |
|-------|--------|----------------|
| solda | OK | — |
| inspecao_qualidade_solda | OK | — |
| rh | OK | — |
| financeiro | RESSALVAS | GRAVE-01: corrigir RLS UUID |
| marketing | RESSALVAS | GRAVE-02: adicionar regra PII clientes |

---

## Próximos Passos

1. **Artur Arquitetura**: corrigir system prompt do agente_marketing (GRAVE-02) — prioridade alta
2. **Gabriel Governança**: corrigir RLS financeiro para UUID (GRAVE-01) — prioridade alta
3. **Ivan Integração**: verificar se outros endpoints também usam string em vez de UUID
4. Re-executar revisão de segurança após correções
```

## Quality Criteria

- [ ] OWASP Agentic Top 10 verificado com status explícito para cada risco
- [ ] Todos os setores sensíveis (rh, financeiro, contabil) têm revisão dedicada
- [ ] Cada item CRÍTICO e GRAVE tem: localização exata, problema, impacto e correção
- [ ] Resultado por setor está em tabela com status individual
- [ ] Veredicto final é um dos três: APROVADO / APROVADO COM RESSALVAS / REPROVADO
- [ ] Próximos passos têm responsável identificado por agente ou cargo

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Veredicto está ausente ou é ambíguo (não é um dos três valores permitidos)
2. Algum setor foi omitido da revisão sem justificativa explícita
