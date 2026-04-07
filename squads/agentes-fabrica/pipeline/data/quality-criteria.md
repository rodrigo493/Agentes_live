# Quality Criteria — Agentes Fábrica

## Critérios de Qualidade para Blueprints de Agentes

### Completude do Blueprint (por agente/setor)
- [ ] Missão do setor está descrita em 1-3 frases claras e não genéricas
- [ ] Lista de responsabilidades tem mínimo 5 itens específicos ao setor
- [ ] Lista de fora-de-escopo tem mínimo 3 itens com destino de escalação
- [ ] System prompt base tem todas as seções obrigatórias (identidade, escopo, memória, regras)
- [ ] Exemplo de resposta esperada está incluído (1 pergunta típica + resposta modelo)

### Arquitetura de Memória
- [ ] Os 3 tipos de memória estão definidos com TTL específico para o setor
- [ ] Importance threshold está definido (não apenas "padrão")
- [ ] Critérios de o que registrar vs. descartar estão explícitos
- [ ] Exemplo de conhecimento que vai para knowledge_memory está incluído
- [ ] Processo de consolidação está especificado (frequência, trigger, responsável)

### Governança de Contexto
- [ ] Políticas de acesso para chat_agente, workspace e grupos estão todas definidas
- [ ] Condição de isolamento entre setores está documentada (ex: RLS policy)
- [ ] Visibilidade dos agentes executivos está especificada (quais dados, read/write)
- [ ] Regra de auditoria está presente (o que é logado e por quanto tempo)

### Integração com Sistema
- [ ] Endpoints de API estão listados com método, path e payload esperado
- [ ] Tabelas do Supabase que o agente acessa estão listadas com permissão (read/write)
- [ ] Estrutura de pastas no Storage está especificada
- [ ] Pelo menos 1 exemplo de query RLS-compliant está incluído

### Segurança
- [ ] Nenhuma regra de acesso permite vazamento de dados entre setores
- [ ] Dados pessoais (nome, CPF, salário) têm política de anonimização em memória
- [ ] Rate limit e custo estimado de tokens por sessão estão previstos
- [ ] Pontos de prompt injection identificados e mitigados

---

## Scoring Geral

| Score | Classificação | Ação |
|-------|--------------|------|
| 90-100% critérios atendidos | APROVADO | Prosseguir para integração |
| 75-89% critérios atendidos | APROVADO COM RESSALVAS | Documentar pendências |
| < 75% critérios atendidos | REPROVADO | Revisão obrigatória antes de integrar |
