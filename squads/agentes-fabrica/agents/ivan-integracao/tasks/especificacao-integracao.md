---
task: "Especificação de Integração com Sistema"
order: 1
input: |
  - blueprint_agentes: Blueprints dos agentes (output/blueprint-agentes.md)
  - regras_memoria: Regras de memória (output/regras-memoria.md)
  - politica_contexto: Políticas de contexto e RLS (output/politica-contexto.md)
  - research_brief: Referências de integração Next.js + Supabase (pipeline/data/research-brief.md)
output: |
  - especificacao_integracao: Especificação técnica de integração para cada setor
    (salvo em squads/agentes-fabrica/output/especificacao-integracao.md)
---

# Especificação de Integração com Sistema

Documentar como cada agente de setor se integra ao sistema Next.js + Supabase: endpoints de API,
tabelas do banco, estrutura de Storage, e arquitetura da camada executiva (CEO, Presidente, Conselheiros).

## Process

1. **Carregar todos os outputs anteriores**: ler blueprint, regras de memória e políticas de contexto.
   Identificar os dados que cada agente lê e escreve para mapear os endpoints necessários.

2. **Para cada setor**, documentar:
   - **Endpoints de API** (Next.js): método, path, payload, resposta esperada, erro esperado
   - **Tabelas do Supabase**: nome, colunas relevantes, permissão (read/write), RLS aplicada
   - **Estrutura de Storage**: path relativo por setor_id, tipos de arquivo, permissão
   - **Graceful degradation**: o que o agente faz se a API retornar erro

3. **Documentar a arquitetura executiva**: como os agentes CEO, Presidente, Conselheiros e Governança
   acessam dados agregados dos setores. Quais views materializedas ou summaries existem, como são atualizados.

4. **Especificar o fluxo de leitura de contexto do agente**: a sequência de passos que o agente executa
   para montar seu contexto antes de responder — desde a query de knowledge_memory até a injeção no prompt.

5. **Listar eventos e webhooks relevantes**: eventos do Supabase que disparam ações no agente
   (nova mensagem, NC registrada, atualização de status).

## Output Format

```markdown
# Especificação de Integração — Agentes por Setor
**Data:** {YYYY-MM-DD}
**Stack:** Next.js {versão} + Supabase

---

## Setor: {nome_setor}

### Endpoints de API (Next.js)

| Método | Path | Descrição |
|--------|------|-----------|
| POST | /api/agent/{setor_id}/chat | Enviar mensagem ao agente |
| GET | /api/agent/{setor_id}/context | Carregar contexto atual |
| POST | /api/agent/{setor_id}/memory | Registrar na memória |

**Detalhamento por endpoint:**

#### POST /api/agent/{setor_id}/chat
```json
// Payload
{
  "user_id": "uuid",
  "message": "string",
  "context_window": 10
}
// Resposta 200
{
  "response": "string",
  "sources": ["memory_id_1", "memory_id_2"],
  "memory_recorded": boolean
}
// Erro 403
{ "error": "Usuário sem acesso ao setor solicitado" }
```

### Tabelas do Supabase

| Tabela | Permissão | Colunas Relevantes | RLS Aplicada |
|--------|-----------|-------------------|--------------|
| {tabela} | {read/write} | {colunas} | {policy_name} |

### Estrutura de Storage

```
/setores/{setor_id}/
  raw_messages/{YYYY}/{MM}/     — mensagens brutas por mês
  processed_memory/              — summaries consolidados
  knowledge_memory/              — vetores e metadados
  documents/                     — documentos técnicos do setor
```

### Fluxo de Contexto do Agente

```
1. Receber query do usuário
2. Extrair keywords da query
3. Buscar knowledge_memory: similarity_search(keywords, top_k=5, setor_id=X)
4. Buscar processed_memory: últimos 3 summaries do usuário no setor
5. Montar prompt: system_prompt + knowledge_context + session_context + query
6. Chamar LLM
7. Avaliar importância da resposta (importance_scorer)
8. Se importance >= threshold: registrar em memory via POST /memory
9. Retornar resposta ao usuário
```

### Graceful Degradation

| Falha | Comportamento do Agente |
|-------|------------------------|
| API timeout | Responde com base em cache local (knowledge_memory pré-carregada) |
| Supabase indisponível | Resposta: "Sistema temporariamente indisponível. Tente em alguns instantes." |
| RLS violation | Log de auditoria + resposta: "Você não tem acesso a essa informação." |

---
(repetir para cada setor)

---

## Arquitetura de Agentes Executivos

### Hierarquia de Visibilidade
{diagrama ASCII da hierarquia}

### Views Agregadas por Nível Executivo

| View | Dados | Atualização | Consumidores |
|------|-------|-------------|--------------|
| executive_daily_summary | Resumo diário por setor | 06:00 diário | agente_ceo |
| executive_weekly_kpis | KPIs consolidados por setor | Domingo 23:00 | agente_ceo, agente_presidente |
| board_quarterly_report | Relatório estratégico completo | Dia 1 do trimestre | conselheiros, governanca |
```

## Output Example

> Use como referência de qualidade, não como template rígido.

```markdown
# Especificação de Integração — Agentes por Setor
**Data:** 2026-04-07
**Stack:** Next.js 15 + Supabase

---

## Setor: solda

### Endpoints de API

| Método | Path | Descrição |
|--------|------|-----------|
| POST | /api/agent/solda/chat | Enviar mensagem ao agente_solda |
| GET | /api/agent/solda/context | Carregar knowledge_memory do setor |
| POST | /api/agent/solda/memory | Registrar conhecimento validado |
| GET | /api/agent/solda/ncs | Listar não-conformidades abertas do setor |

#### POST /api/agent/solda/chat
```json
// Payload
{
  "user_id": "a1b2c3d4-...",
  "message": "Qual amperagem para soldar aço 1020 de 3mm em MIG?",
  "context_window": 10,
  "include_ncs": true
}
// Resposta 200
{
  "response": "Para aço 1020 de 3mm em MIG: 90-110A, 18-20V, arame ER70S-6 0.8mm...",
  "sources": ["km_solda_001", "km_solda_008"],
  "memory_recorded": false,
  "suggested_record": {
    "content": "Consulta sobre parâmetros MIG 1020 3mm",
    "importance": 0.4
  }
}
```

### Tabelas do Supabase

| Tabela | Permissão | Colunas Relevantes | RLS Aplicada |
|--------|-----------|-------------------|--------------|
| sector_messages | read+write | id, setor_id, user_id, content, created_at | solda_isolation |
| sector_memory | read+write | id, setor_id, type, content, importance, embedding | memory_setor_isolation |
| non_conformances | read+write | id, setor_id, description, status, resolution | nc_setor_isolation |
| sectors | read | id, name, slug, manager_id | public |

### Estrutura de Storage

```
/setores/solda_{uuid}/
  raw_messages/2026/04/           — arquivos JSON com sessões brutas
  processed_memory/               — summaries.jsonl com embeddings
  knowledge_memory/               — knowledge.jsonl vetorizado
  documents/                      — manuais de equipamento, procedimentos
```

### Fluxo de Contexto do Agente_Solda

```
1. Receber query: "Qual amperagem para soldar aço 1020 3mm?"
2. Extrair keywords: ["aço 1020", "3mm", "MIG", "amperagem", "parâmetros"]
3. similarity_search(keywords, setor_id='solda', top_k=5, min_score=0.7)
4. Carregar últimos 3 summaries do usuário no setor (processed_memory)
5. Montar prompt com knowledge + contexto de sessão + query
6. LLM responde com parâmetros + aviso de segurança
7. importance_scorer avalia: parâmetro novo = 0.35 (não gravar — já existe)
8. Retornar resposta
```

### Graceful Degradation

| Falha | Comportamento |
|-------|--------------|
| knowledge_memory indisponível | Responde: "Não consigo acessar a base de conhecimento agora. Para parâmetros de soldagem, consulte o manual do equipamento ou o supervisor." |
| API timeout > 5s | Retornar resposta em cache para as 10 perguntas mais frequentes do setor |
| RLS violation 403 | Log em audit_access_denied + "Você não tem acesso ao setor de solda." |

---

## Arquitetura de Agentes Executivos

### Hierarquia de Visibilidade

```
agente_governanca (auditoria total — logs de acesso)
      │
agente_conselho (relatórios trimestrais de todos os setores)
      │
agente_presidente (KPIs semanais + alertas críticos)
      │
  agente_ceo (resumos diários + alertas em tempo real)
      │
  ┌───┬───┬───┬───┬───┐
  │   │   │   │   │   │
setor-a setor-b ... (17 setores operacionais)
```

### Views Agregadas

| View Materializada | Dados | Atualização | Consumidores |
|---------------------|-------|-------------|--------------|
| v_executive_daily | NCs abertas, produção do dia, alertas | 06:00 diário | agente_ceo |
| v_executive_weekly | KPIs por setor, tendências | Domingo 23:00 | agente_ceo, agente_presidente |
| v_board_quarterly | DRE, ocupação, qualidade consolidada | Dia 1 do trimestre | conselheiros, governanca |
```

## Quality Criteria

- [ ] Endpoints listados com método, path e exemplo de payload/resposta para cada setor
- [ ] Tabelas do Supabase mapeadas com permissão e RLS policy correspondente
- [ ] Estrutura de Storage especificada com path relativo ao setor_id
- [ ] Fluxo de contexto do agente documentado em pseudocódigo sequencial
- [ ] Graceful degradation especificada para pelo menos 3 cenários de falha
- [ ] Arquitetura executiva documentada com views e frequência de atualização

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Algum endpoint documentado não inclui o cenário de erro (apenas happy path)
2. Arquitetura executiva não especifica como agente_ceo acessa dados (mínimo obrigatório)
