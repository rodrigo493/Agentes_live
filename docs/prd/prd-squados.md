# PRD — SquadOS: Sistema Operacional Corporativo Inteligente

> **Produto:** SquadOS
> **Domínio:** squad.liveuni.com.br
> **Versão:** 1.0.0-draft
> **Data:** 2026-04-07
> **Autor:** @architect (Aria) + @pm (Morgan)
> **Status:** Draft

---

## 1. Visão do Produto

O **SquadOS** é o sistema operacional interno da empresa/fábrica, projetado para ser a base operacional e de conhecimento corporativo. Ele centraliza comunicação, organiza conhecimento por setor, registra memória operacional e serve de plataforma para agentes de IA especializados e executivos.

**Missão:** Transformar a operação da fábrica em um organismo inteligente onde cada setor acumula conhecimento, cada interação enriquece a memória coletiva e agentes de IA amplificam a capacidade decisória em todos os níveis.

---

## 2. Personas

| Persona | Perfil | Necessidade Principal |
|---------|--------|----------------------|
| **Operador de Setor** | Funcionário de chão de fábrica (solda, pintura, montagem) | Consultar procedimentos, reportar problemas, acessar conhecimento do setor |
| **Gestor de Setor** | Líder/supervisor de área | Visão do setor, gestão de equipe, acompanhamento de operações |
| **Administrador** | TI/gestão operacional | Gerenciar usuários, setores, permissões e conteúdos |
| **Master Admin** | Dono/CEO da empresa | Controle total, visão executiva consolidada |
| **Agente Especialista** | IA vinculada ao setor | Responder perguntas com base no conhecimento acumulado do setor |
| **Agente Executivo** | IA de nível estratégico (CEO, presidente, conselheiros) | Consolidar visão de todos os setores, apoiar decisões |

---

## 3. Requisitos Funcionais (FR)

### FR-01: Autenticação e Gestão de Usuários
- FR-01.1: Login com email/senha via Supabase Auth
- FR-01.2: Perfis: master_admin, admin, manager, operator, viewer
- FR-01.3: Cada usuário vinculado a um setor principal
- FR-01.4: Somente admin/master_admin criam usuários
- FR-01.5: Status de usuário: active, inactive, suspended
- FR-01.6: Opção de 2FA para admin e master_admin
- FR-01.7: Sessão segura com expiração configurável
- FR-01.8: Edição/desativação de usuários (soft delete)

### FR-02: Chat com Agente (Setor)
- FR-02.1: Cada usuário conversa com o agente do seu setor principal
- FR-02.2: Agente responde com base em transcrições, documentos e memória do setor
- FR-02.3: Histórico completo com timestamps, usuário, setor, origem
- FR-02.4: Mensagens enriquecem a memória/contexto do setor
- FR-02.5: Admins podem auditar conversas conforme permissões
- FR-02.6: Agentes executivos têm acesso consolidado conforme governança

### FR-03: Workspace Corporativo (Chat Interno)
- FR-03.1: Lista de contatos estilo WhatsApp com busca e status
- FR-03.2: Chat 1:1 entre usuários
- FR-03.3: Grupos criados por admin/master_admin
- FR-03.4: Grupos com nome, descrição, setor principal opcional
- FR-03.5: Gestão de participantes por admin/master_admin
- FR-03.6: Mensagens em texto (estrutura pronta para anexos)
- FR-03.7: Histórico completo com contexto
- FR-03.8: Agentes de setor acessam conversas dos seus usuários
- FR-03.9: Agente do setor principal do grupo acessa contexto completo do grupo

### FR-04: Setores e Pastas de Conhecimento
- FR-04.1: 17 setores iniciais pré-cadastrados
- FR-04.2: Estrutura extensível para novos setores
- FR-04.3: Cada setor: cadastro, pasta de conhecimento, área de ingestão
- FR-04.4: Upload de transcrições de reuniões por setor
- FR-04.5: Histórico de documentos e conteúdos por setor
- FR-04.6: Memória acumulada por setor
- FR-04.7: Vínculo setor → agente especialista

### FR-05: Memória e Conhecimento
- FR-05.1: Registro de todas as interações (chat agente + workspace)
- FR-05.2: Separação memória do chat agente vs memória do workspace
- FR-05.3: Memória organizada por setor, usuário, conversa, origem, timestamp
- FR-05.4: Estrutura pronta para RAG/embedding futuro
- FR-05.5: Registro de quem falou, em qual contexto, setor e canal
- FR-05.6: Versionamento contínuo com novas interações

### FR-06: Auditoria e Segurança
- FR-06.1: Logs de ações críticas (CRUD usuários, permissões, etc.)
- FR-06.2: Logs de acesso negado
- FR-06.3: Rastreabilidade completa
- FR-06.4: Soft delete com histórico

### FR-07: Painel Administrativo
- FR-07.1: Gestão de usuários (CRUD)
- FR-07.2: Gestão de setores (CRUD)
- FR-07.3: Gestão de grupos
- FR-07.4: Gestão de permissões
- FR-07.5: Gestão de ingestão de conteúdos

### FR-08: Painel Executivo (Futuro)
- FR-08.1: Visão consolidada por setor
- FR-08.2: Alertas e resumos
- FR-08.3: Sugestões estratégicas
- FR-08.4: Interface para agentes executivos

### FR-09: Infraestrutura
- FR-09.1: Deploy em VPS Linux
- FR-09.2: Domínio squad.liveuni.com.br
- FR-09.3: Deploy contínuo
- FR-09.4: Ambientes separados (dev, staging, prod)
- FR-09.5: Backup e recuperação

---

## 4. Requisitos Não-Funcionais (NFR)

| ID | Categoria | Requisito |
|----|-----------|-----------|
| NFR-01 | Segurança | RBAC em 4 camadas (menu, rotas, API, banco) |
| NFR-02 | Segurança | RLS ativado em todas as tabelas sensíveis |
| NFR-03 | Segurança | Zero secrets no frontend |
| NFR-04 | Segurança | Rate limiting em todas as APIs |
| NFR-05 | Segurança | Proteção contra privilege escalation |
| NFR-06 | Segurança | Validação server-side de todos os inputs |
| NFR-07 | Segurança | Verificação de assinatura em webhooks |
| NFR-08 | Performance | Tempo de resposta < 500ms para operações comuns |
| NFR-09 | Performance | Suporte a 100+ usuários simultâneos |
| NFR-10 | Escalabilidade | Arquitetura modular permitindo novos módulos |
| NFR-11 | Escalabilidade | Estrutura pronta para busca semântica |
| NFR-12 | Disponibilidade | 99.5% uptime |
| NFR-13 | Manutenibilidade | Código TypeScript tipado, padrões consistentes |
| NFR-14 | Observabilidade | Logs estruturados, métricas de uso |

---

## 5. Restrições (CON)

| ID | Restrição |
|----|-----------|
| CON-01 | Stack: Next.js + TypeScript + Supabase + Tailwind |
| CON-02 | Deploy em VPS Linux única (squad.liveuni.com.br) |
| CON-03 | Supabase como backend principal (Auth, Postgres, Storage, Realtime) |
| CON-04 | Orquestração de agentes via OpenSquad (futuro) |
| CON-05 | Princípio do menor privilégio como default |
| CON-06 | Toda lógica sensível no servidor (Server Actions / Route Handlers) |

---

## 6. Setores Iniciais

| # | Setor (slug) | Área |
|---|-------------|------|
| 1 | solda | Produção |
| 2 | inspecao_qualidade_solda | Qualidade |
| 3 | lavagem | Produção |
| 4 | pintura | Produção |
| 5 | inspecao_qualidade_pintura | Qualidade |
| 6 | montagem | Produção |
| 7 | expedicao | Logística |
| 8 | compras | Suprimentos |
| 9 | comercial | Comercial |
| 10 | marketing | Marketing |
| 11 | financeiro | Financeiro |
| 12 | contabil | Financeiro |
| 13 | administrativo | Administrativo |
| 14 | rh | RH |
| 15 | pos_venda | Pós-venda |
| 16 | assistencia_tecnica | Suporte |
| 17 | engenharia | Engenharia |

---

## 7. Camada Executiva de Agentes (Preparação)

| Agente | Nível | Acesso |
|--------|-------|--------|
| agente_ceo | Executivo | Todas as memórias e contextos |
| agente_presidente | Executivo | Consolidação total |
| conselheiro_administrativo | Conselheiro | Análise administrativa |
| conselheiro_de_processos | Conselheiro | Análise de processos |
| conselheiro_financeiro | Conselheiro | Análise financeira |
| conselheiro_estrategico | Conselheiro | Análise estratégica |
| agente_governanca | Governança | Alinhamento de decisões |

**Fluxo:** Agentes especialistas → agente_ceo (consolida) → agente_presidente (distribui) → conselheiros (analisam) → agente_governanca (alinha) → feedback consolidado → presidente

---

## 8. Módulos do Sistema

| # | Módulo | MVP | Fase |
|---|--------|-----|------|
| 1 | Autenticação e Usuários | Sim | 1 |
| 2 | Chat com Agente | Sim | 1 |
| 3 | Workspace Corporativo | Sim | 1 |
| 4 | Setores e Pastas de Conhecimento | Sim | 1 |
| 5 | Memória e Conhecimento | Sim | 1 |
| 6 | Auditoria e Segurança | Sim | 1 |
| 7 | Painel Administrativo | Sim | 2 |
| 8 | Painel Executivo | Não | 3 |
| 9 | Infraestrutura e Deploy | Sim | 1 |

---

*PRD SquadOS v1.0.0-draft — Synkra AIOX*
