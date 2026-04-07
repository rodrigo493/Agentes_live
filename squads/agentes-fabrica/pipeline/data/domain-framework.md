# Domain Framework — Arquitetura de Agentes por Setor

## Framework Operacional: Padrão Live Universe de Agente Especialista

Este framework define o método de criação e operação de agentes especialistas por setor
no sistema interno da Live Universe (fábrica de equipamentos de Pilates e funcional).

---

## Etapa 1: Definição de Identidade do Agente

Para cada setor, definir:
- **Nome do agente**: `agente_{setor_id}` (ex: `agente_solda`, `agente_marketing`)
- **Missão do setor**: o que esse setor faz na operação da fábrica
- **Responsabilidades do agente**: quais perguntas ele pode responder
- **Limites de escopo**: o que está FORA do escopo deste agente
- **Escalação**: para onde escalar quando o agente não tem resposta

## Etapa 2: Definição de Memória

Para cada setor, configurar:
- **raw_messages TTL**: período de retenção de conversas brutas (padrão: 30 dias)
- **processed_memory TTL**: período de retenção de summaries (padrão: 90 dias)
- **knowledge_memory**: base de conhecimento permanente do setor
- **Importance threshold**: score mínimo para persistência (padrão: 0.4)
- **Consolidation schedule**: frequência de consolidação (padrão: noturno)

## Etapa 3: Definição de Políticas de Contexto

Para cada tipo de interação, definir:
- **chat_agente**: quem pode iniciar chat com o agente do setor
- **workspace**: quem pode ver mensagens do workspace do setor
- **grupos**: regras de criação e acesso a grupos temáticos
- **visibilidade executiva**: quais agentes executivos (CEO, Presidente) podem ler

## Etapa 4: Criação do Prompt Base

Construir o system prompt do agente com:
- Identidade e missão
- Escopo de responsabilidade
- Injeção de knowledge_memory relevante
- Regras de resposta e tom
- Gatilhos de escalação
- Instruções de registro de memória

## Etapa 5: Especificação de Integração

Documentar:
- Endpoints da API que o agente consome
- Tabelas do Supabase que o agente lê/escreve
- Políticas RLS aplicadas
- Estrutura de arquivos no Storage
- Eventos e webhooks relevantes

## Etapa 6: Validação de Segurança

Verificar:
- Isolamento entre setores (sem vazamento)
- Anonimização de dados sensíveis em memória
- Proteção contra prompt injection
- Limites de rate e custo de tokens
- Auditability (logs de decisão)

---

## Hierarquia de Agentes

```
agente_conselho
      │
agente_presidente
      │
  agente_ceo
      │
  ┌───────────────────────────────────┐
  │                                   │
agentes_operacionais         agentes_administrativos
  (solda, pintura,             (financeiro, rh,
   montagem, etc.)              contabil, etc.)
```

### Regras de Hierarquia
- Agentes de setor respondem APENAS usuários do seu setor
- Agentes executivos têm visibilidade multi-setor (read-only por padrão)
- Agente CEO pode iniciar consultas a qualquer agente de setor
- Governança/Conselho tem visibilidade total e pode emitir diretrizes

---

## Padrão de Estrutura do Setor no Supabase

```sql
-- Tabelas principais
sectors (id, name, slug, manager_id, created_at)
sector_agents (id, sector_id, config JSONB, active BOOLEAN)
sector_memory (id, sector_id, type ENUM, content TEXT, importance FLOAT, ttl TIMESTAMP)
sector_messages (id, sector_id, user_id, agent_id, role, content, created_at)
sector_documents (id, sector_id, title, content, embedding VECTOR, tags TEXT[])
```
