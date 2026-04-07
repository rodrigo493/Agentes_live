# Anti-Patterns — Agentes Fábrica

## Erros Críticos na Criação de Agentes Especialistas

---

### 1. Agente sem escopo definido (CRÍTICO)
**O que é:** Criar um agente sem lista explícita de responsabilidades e fora-de-escopo.
**Por que é prejudicial:** O agente começa a "ajudar" em qualquer assunto, contaminando
context, gerando respostas incorretas e criando dependência em dados de outros setores.
**Como evitar:** Todo agente DEVE ter uma lista de responsabilidades e uma lista de
"fora de escopo com destino de escalação" antes de ser deployed.

### 2. Gravar transcrições brutas na knowledge_memory (CRÍTICO)
**O que é:** Salvar conversas completas como knowledge em vez de insights destilados.
**Por que é prejudicial:** Polui o vector store com informação redundante e de baixo
valor, degrada a precisão da busca semântica, aumenta custo de token e esconde
os conhecimentos reais.
**Como evitar:** Aplicar importance scoring. Registrar apenas: decisões relevantes,
soluções validadas, parâmetros aprovados, regras descobertas. Nunca smalltalk.

### 3. Compartilhar memória entre setores sem política explícita (CRÍTICO)
**O que é:** Permitir que agente_solda acesse knowledge_memory do agente_rh, por exemplo.
**Por que é prejudicial:** Vazamento de dados sensíveis (salários, avaliações, dados pessoais),
violação de LGPD, perda de confiança dos usuários no sistema.
**Como evitar:** RLS por setor_id em todas as tabelas de memória. Agentes leem APENAS
da sua própria pasta de setor. Exceção documentada apenas para agentes executivos.

### 4. Prompts genéricos sem grounding no setor (GRAVE)
**O que é:** System prompt que poderia servir para qualquer setor sem adaptação.
**Por que é prejudicial:** Agente dá respostas vagas, não conhece termos do setor,
não sabe quando escalar, não registra o que importa para aquele contexto específico.
**Como evitar:** Cada system prompt deve conter: missão específica do setor,
vocabulário técnico do setor, exemplos de perguntas típicas, regras de resposta
específicas para aquele domínio.

### 5. Ausência de regra de escalação (GRAVE)
**O que é:** Agente configurado sem instrução clara de "quando não sabe, faça X".
**Por que é prejudicial:** O agente inventa respostas (hallucination) em vez de admitir
limitação, gerando desinformação operacional com impacto em qualidade e segurança.
**Como evitar:** Todo agente deve ter instrução explícita: "Se não encontrar a resposta
na sua base de conhecimento, informe que não tem essa informação e sugira o destino
correto (supervisor, setor X, documentação Y)."

### 6. Ignorar hierarquia de agentes na governança (GRAVE)
**O que é:** Agente de setor pode responder diretamente a agente_ceo sem filtro.
**Por que é prejudicial:** Agentes de setor não estão preparados para contexto executivo,
podem vazar dados operacionais sem sumarização, ou dar respostas táticas onde
a visão deveria ser estratégica.
**Como evitar:** Definir explicitamente quais dados os agentes executivos podem acessar
e em qual formato (summaries agregados, não transações individuais).

---

## Sempre Fazer

1. **Versionar blueprints**: todo blueprint de agente deve ter versão e data. Mudanças são
   documentadas como delta, não substituição silenciosa.

2. **Testar com perguntas edge-case**: antes de deploiar, testar cada agente com pelo menos
   3 perguntas fora do escopo para confirmar que a escalação funciona.

3. **Definir ownership por setor**: cada agente de setor tem um humano responsável
   (gestor do setor) que valida e atualiza o knowledge_memory periodicamente.

4. **Separar templates de respostas**: criar biblioteca de templates de resposta para
   as 5-10 perguntas mais frequentes do setor — garante consistência e reduz custo.

5. **Documentar a linha de raciocínio**: ao registrar algo em knowledge_memory, incluir
   o contexto: quem validou, quando, com qual base. Memória sem proveniência é memória
   não confiável.
