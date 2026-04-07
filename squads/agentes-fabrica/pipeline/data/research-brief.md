# Research Brief — Agentes Fábrica

## Domínio: Arquitetura de Agentes Especialistas por Setor

---

## 1. Arquitetura de Memória para Agentes IA

### Hierarquia de 4 Camadas (padrão emergente 2025)

| Camada | Tipo | Descrição | Quando usar |
|--------|------|-----------|-------------|
| **raw_messages** | Episódica | Mensagens brutas das conversas, sem processamento | Auditoria, replay de contexto |
| **processed_memory** | Episódica processada | Blocos contíguos de sessões resumidos por LLM local | Contexto recente do agente |
| **knowledge_memory** | Semântica | Fatos reutilizáveis extraídos, sem duplicidade | Base de conhecimento do setor |
| **themes** | Temática | Grupos de fatos relacionados para busca de alto nível | Resposta a perguntas complexas |

### Pipeline de Consolidação
```
raw_messages → [LLM local Qwen2.5 1.5B] → episodes → [extração de fatos] → knowledge_memory
```

### Anti-Pollution Strategies
- **Importance scoring**: score 0-1 atribuído no momento da gravação; score < 0.3 descartado
- **TTL por tipo**: raw_messages (30 dias), processed_memory (90 dias), knowledge_memory (sem expiração automática)
- **Consolidação periódica**: run noturno que merge e deduplica knowledge_memory
- **Insight over transcript**: nunca gravar transcrições completas — gravar apenas insights destilados

### Fontes
- Analytics Vidhya — Memory Systems in AI Agents (2026)
- AWS AgentCore Long-Term Memory Deep Dive
- xMemory patterns (VentureBeat 2025)
- Mem0 — Production-Ready AI Agents with Scalable Long-Term Memory (arXiv 2025)

---

## 2. Governança de Contexto Multi-Agente

### Modelos de Controle de Acesso

| Modelo | Quando usar | Adequação para Live Universe |
|--------|-------------|------------------------------|
| **RBAC** (Role-Based) | Papéis estáveis e predefinidos | Agentes de setor vs. executivos |
| **ABAC** (Attribute-Based) | Decisões context-aware por atributo | Acesso por setor_id, turno, tipo de mensagem |
| **PBAC** (Policy-Based) | Flota de agentes com políticas centralizadas | Governança executiva (CEO, Conselheiros) |

### Tipos de Contexto e Isolamento

| Tipo | Descrição | Isolamento requerido |
|------|-----------|----------------------|
| **chat_agente** | Conversa 1:1 usuário-agente do setor | RLS por user_id + setor_id |
| **workspace** | Mensagens entre usuários do mesmo setor | RLS por setor_id + workspace_id |
| **grupos** | Canal temático multi-usuário | RLS por grupo_id + permissão explícita |

### OWASP Agentic Top 10 (Riscos Relevantes)
1. Agent goal hijacking — agente manipulado a responder fora de escopo
2. Memory and context poisoning — injeção de dados falsos na memória
3. Insecure inter-agent communication — vazamento entre setores
4. Rogue agent behavior — agente agindo fora de sua autoridade

### Fontes
- Microsoft Agent Governance Toolkit (Abril 2026)
- CSA Research Note — AI Agent Governance Framework (Abril 2026)
- OWASP Agentic Top 10 (Dezembro 2025)
- onereach.ai — Smarter Context Engineering for Multi-Agent Systems

---

## 3. Engenharia de Prompt para Agentes Especializados

### Princípios para Agentes de Domínio Industrial

1. **Escopo explícito**: instrução clara do que o agente FAZ e do que NÃO FAZ
2. **Grounding no setor**: agente conhece termos, processos e responsabilidades do setor
3. **Hierarquia de conhecimento**: knowledge_memory do setor > knowledge global > resposta generativa
4. **Delegação clara**: quando o agente não sabe → escala para supervisor humano ou agente executivo
5. **Contexto mínimo eficiente**: injetar apenas o contexto relevante para a query atual
6. **Registro disciplinado**: toda decisão relevante é registrada na memória do setor

### Estrutura de Prompt Padrão por Agente

```
[IDENTIDADE]
Você é {nome_agente}, especialista do setor {nome_setor} da Live Universe.
Sua missão: {missao_especifica_do_setor}.

[ESCOPO]
Você responde APENAS questões relacionadas a: {lista_de_responsabilidades}.
Para temas fora do seu escopo, oriente o usuário ao setor responsável.

[MEMÓRIA DO SETOR]
{knowledge_memory_do_setor}

[CONTEXTO ATUAL]
{processed_memory_recente}

[REGRAS DE REGISTRO]
- Registre decisões com impacto > {threshold} em knowledge_memory
- Nunca registre dados pessoais sem anonimização
- Score de importância mínimo para persistência: 0.4
```

### Fontes
- PromptHub — Prompt Engineering for AI Agents
- NVIDIA Nemotron Labs — Specialized AI Agents (2025)
- Augment Code — 11 Prompting Techniques for Better AI Agents
- promptingguide.ai — LLM Agents reference

---

## 4. Integração Next.js + Supabase para Agentes

### Padrão de Isolamento via RLS (Row Level Security)

```sql
-- Política de isolamento por setor
CREATE POLICY "agents_setor_isolation" ON messages
  USING (setor_id = current_setting('app.setor_id')::uuid);

-- Política de acesso agente-setor
CREATE POLICY "agent_read_own_setor" ON agent_memory
  USING (setor_id = auth.jwt()->'setor_id');
```

### Estrutura de Pastas por Setor (Supabase Storage)
```
/setores/{setor_id}/
  raw_messages/        — conversas brutas por data
  processed_memory/    — summaries consolidados
  knowledge_memory/    — base de conhecimento vetorizada
  documents/           — documentos técnicos do setor
  templates/           — templates de resposta padrão
```

### API Pattern Next.js para Agentes
```
POST /api/agent/{setor_id}/chat     — enviar mensagem ao agente
GET  /api/agent/{setor_id}/context  — carregar contexto do setor
POST /api/agent/{setor_id}/memory   — registrar na memória do setor
GET  /api/agent/{setor_id}/memories — listar memórias do setor
```
