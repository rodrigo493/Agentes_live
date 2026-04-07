# Squad Memory: Agentes Fábrica

## Decisões de Arquitetura

- **Isolamento por setor_id UUID:** A chave primária de isolamento entre agentes é sempre o UUID do setor (não o code string). Isso foi validado em todas as tabelas e policies RLS.
- **Modelo operacional vs. executivo:** Agentes setoriais usam `claude-sonnet-4-6`; agentes executivos (CEO, Presidente) usam `claude-opus-4-6` para maior capacidade de raciocínio estratégico.
- **Agentes puramente consultivos:** Nenhum agente tem `tool_use` de ação em sistemas externos. Toda escrita de dados é feita pelo servidor (Next.js API routes) — nunca pelo agente diretamente.
- **Camada executiva read-only:** `executive_views` é gerado pelo `service_role` via cron job. CEO e Presidente nunca acessam raw messages — apenas métricas agregadas e anonimizadas.
- **Busca semântica via pgvector:** knowledge_memory usa `vector(1536)` com index `ivfflat` para busca semântica (cosine similarity). Threshold padrão: 0.7.

## Setores Documentados

**Run 2026-04-07-115128 — todos os 17 setores processados:**

Operacionais: solda, inspecao_qualidade_solda, lavagem, pintura, inspecao_qualidade_pintura, montagem, expedicao

Suporte: compras, engenharia, assistencia_tecnica

Comercial: comercial, marketing, pos_venda

Administrativo: financeiro, contabil, administrativo, rh

## Padrões Validados

- **TTL de raw_messages:** 30 dias para todos, exceto RH (14 dias — LGPD)
- **Threshold de importância RH:** 0.70 (o mais alto) — máxima restrição
- **Processed memory escrita apenas por service_role** — nunca pelo usuário
- **Cross-setor:** 10 relações explicitamente permitidas documentadas; qualquer outra é default deny
- **LGPD:** financeiro, contábil e RH têm `lgpd_basis` obrigatório em cada registro de knowledge_memory

## Proibições Explícitas

- Nunca armazenar valores absolutos financeiros em knowledge_memory ou executive_views
- Nunca armazenar dados pessoais individuais de colaboradores em qualquer camada de memória do RH
- Nunca expor SUPABASE_SERVICE_ROLE_KEY ao client bundle
- Nunca logar campo `content` de mensagens em logs de servidor
- Nunca criar agente com tool_use de escrita direta em banco ou sistemas externos

## Técnico (específico do squad)

- **Outputs da run 2026-04-07-115128:** `output/2026-04-07-115128/v1/` (5 arquivos)
- **Veredicto de segurança:** APROVADO COM RESSALVAS — 1 item CRÍTICO (service_role_key leak) e 2 GRAVES (IDOR endpoints + logs com conteúdo sensível) a corrigir antes do deploy
- **Achados de segurança críticos** documentados em `output/2026-04-07-115128/v1/revisao-seguranca.md`
- **Checklist de implementação** em `output/2026-04-07-115128/v1/especificacao-integracao.md` (seção final)
