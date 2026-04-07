---
execution: inline
agent: squads/agentes-fabrica/agents/ivan-integracao
inputFile: squads/agentes-fabrica/output/politica-contexto.md
outputFile: squads/agentes-fabrica/output/especificacao-integracao.md
---

# Step 05: Especificação de Integração com Sistema

## Context Loading

Carregar estes arquivos antes de executar:
- `squads/agentes-fabrica/output/blueprint-agentes.md` — blueprints dos agentes (Step 2)
- `squads/agentes-fabrica/output/regras-memoria.md` — regras de memória (Step 3)
- `squads/agentes-fabrica/output/politica-contexto.md` — políticas de contexto e RLS (Step 4)
- `squads/agentes-fabrica/pipeline/data/research-brief.md` — referências de integração Next.js + Supabase

## Instructions

### Process

1. Para cada setor presente nos blueprints, documentar a integração técnica completa:
   - Endpoints de API Next.js com método, path, payload e resposta (happy path + error path)
   - Tabelas do Supabase acessadas com colunas relevantes, permissão e RLS policy correspondente
   - Estrutura de pastas no Storage (paths relativos ao setor_id, nunca ao nome do setor)
   - Fluxo sequencial de contexto do agente (como monta o prompt antes de responder)
   - Graceful degradation para os 3 cenários mais prováveis de falha
2. Documentar a arquitetura dos agentes executivos:
   - Hierarquia visual (diagrama ASCII)
   - Views materializadas ou summaries: nome, dados, frequência de atualização, consumidores
3. Consolidar em `output/especificacao-integracao.md`.

## Output Format

```markdown
# Especificação de Integração — Agentes por Setor
**Data:** {YYYY-MM-DD}
**Stack:** Next.js + Supabase

---

## Setor: {nome}

### Endpoints de API

| Método | Path | Descrição |
|--------|------|-----------|
{tabela}

**Detalhamento:** {payload + resposta em JSON comentado}

### Tabelas do Supabase

| Tabela | Permissão | Colunas | RLS |
|--------|-----------|---------|-----|
{tabela}

### Estrutura de Storage

```
/setores/{setor_id}/
  raw_messages/...
  processed_memory/...
  knowledge_memory/...
  documents/...
```

### Fluxo de Contexto

```
1. Receber query
2. Extrair keywords
3. Buscar knowledge_memory (similarity search)
4. Carregar processed_memory recente
5. Montar prompt
6. LLM responde
7. Avaliar importance
8. Registrar se relevante
9. Retornar resposta
```

### Graceful Degradation

| Falha | Comportamento |
|-------|--------------|
{tabela}

---

## Arquitetura de Agentes Executivos

{diagrama ASCII}

### Views Agregadas

| View | Dados | Atualização | Consumidores |
|------|-------|-------------|--------------|
{tabela}
```

## Output Example

Ver `pipeline/data/output-examples.md` — a seção de integração do Setor solda como referência
de profundidade esperada nos endpoints, fluxo de contexto e views executivas.

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Algum endpoint documentado não inclui o cenário de erro
2. Arquitetura executiva não especifica como agente_ceo acessa dados

## Quality Criteria

- [ ] Endpoints com método, path, payload e resposta (incluindo erro) para cada setor
- [ ] Tabelas do Supabase com permissão e RLS correspondente
- [ ] Storage com path relativo ao setor_id (UUID, não nome)
- [ ] Fluxo de contexto em pseudocódigo sequencial
- [ ] Graceful degradation para ao menos 3 cenários de falha
- [ ] Arquitetura executiva com views e frequência de atualização
