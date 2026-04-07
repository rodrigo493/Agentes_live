---
execution: inline
agent: squads/agentes-fabrica/agents/sofia-seguranca
inputFile: squads/agentes-fabrica/output/especificacao-integracao.md
outputFile: squads/agentes-fabrica/output/revisao-seguranca.md
on_reject: 2
---

# Step 06: Revisão de Segurança

## Context Loading

Carregar estes arquivos antes de executar:
- `squads/agentes-fabrica/output/blueprint-agentes.md` — blueprints dos agentes
- `squads/agentes-fabrica/output/regras-memoria.md` — regras de memória
- `squads/agentes-fabrica/output/politica-contexto.md` — políticas de contexto e RLS
- `squads/agentes-fabrica/output/especificacao-integracao.md` — especificação de integração
- `squads/agentes-fabrica/pipeline/data/anti-patterns.md` — anti-patterns do domínio

## Instructions

### Process

1. Revisar os 4 outputs dos agentes anteriores sistematicamente.
2. Verificar os 6 riscos OWASP Agentic mais relevantes para cada setor:
   agent goal hijacking, memory poisoning, inter-agent leaks, rogue agents,
   sensitive data exposure, audit gaps.
3. Classificar cada problema encontrado como CRÍTICO, GRAVE ou OBSERVAÇÃO.
4. Para setores sensíveis (rh, financeiro, contabil): revisão dedicada e mais rigorosa.
5. Emitir veredicto: APROVADO, APROVADO COM RESSALVAS ou REPROVADO.
6. Se REPROVADO: o pipeline retorna ao Step 2 (on_reject: 2) com lista de itens a corrigir.

## Output Format

```markdown
# Relatório de Revisão de Segurança
**Data:** {YYYY-MM-DD}
**Setores revisados:** {lista}
**Veredicto:** {APROVADO | APROVADO COM RESSALVAS | REPROVADO}

## Resumo Executivo
{2-4 frases}

## Itens CRÍTICOS
{lista ou "Nenhum item crítico identificado."}

## Itens GRAVES
{lista ou "Nenhum item grave identificado."}

## Observações
{lista ou "Nenhuma observação adicional."}

## Checklist OWASP Agentic Top 10

| Risco | Status | Observação |
|-------|--------|------------|
{tabela com 6 riscos verificados}

## Resultado por Setor

| Setor | Status | Itens Pendentes |
|-------|--------|----------------|
{tabela}

## Próximos Passos
{lista com responsável e prioridade}
```

## Output Example

Ver `pipeline/data/output-examples.md` — para o padrão de relatório esperado com veredicto
"APROVADO COM RESSALVAS", incluindo itens GRAVES e checklist OWASP completo.

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Veredicto está ausente ou não é um dos três valores: APROVADO / APROVADO COM RESSALVAS / REPROVADO
2. Algum setor foi omitido da revisão

## Quality Criteria

- [ ] OWASP Agentic Top 10 verificado (ao menos os 6 mais relevantes)
- [ ] Setores sensíveis têm revisão dedicada
- [ ] Itens CRÍTICO e GRAVE têm localização exata, problema, impacto e correção
- [ ] Veredicto final explícito com justificativa
- [ ] Próximos passos têm responsável identificado
