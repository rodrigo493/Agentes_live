---
task: "Política de Contexto por Setor"
order: 1
input: |
  - blueprint_agentes: Blueprints dos agentes (output/blueprint-agentes.md)
  - regras_memoria: Regras de memória por setor (output/regras-memoria.md)
  - research_brief: Referências de governança (pipeline/data/research-brief.md)
output: |
  - politica_contexto: Políticas de acesso e isolamento para cada setor
    (salvo em squads/agentes-fabrica/output/politica-contexto.md)
---

# Política de Contexto por Setor

Definir as políticas de acesso e isolamento de contexto para cada tipo de interação (chat com agente,
workspace, grupos) por setor, incluindo RLS policies implementáveis e especificação de visibilidade
para a hierarquia de agentes executivos.

## Process

1. **Carregar blueprints e regras de memória**: ler `output/blueprint-agentes.md` e `output/regras-memoria.md`.
   Identificar quais setores têm dados sensíveis (rh, financeiro, contabil) e quais são operacionais.

2. **Para cada setor**, definir políticas para os 3 tipos de contexto:
   - **chat_agente**: quais roles/usuários podem iniciar conversa com o agente; histórico visível
   - **workspace**: quais roles podem ver e postar no workspace do setor; regras de visibilidade entre membros
   - **grupos**: regras de criação, participação e moderação; permissão para membros externos ao setor

3. **Definir políticas de visibilidade executiva**: especificar para agente_ceo, agente_presidente, conselheiros e governança:
   - Quais tipos de dados podem ver por setor (summaries, indicadores, conversas?)
   - Em qual formato (agregado, individual, mascarado?)
   - Com qual granularidade (mensal, semanal, por ocorrência?)

4. **Gerar RLS policies implementáveis** para cada combinação de setor + tipo de acesso.
   Cada policy deve ser SQL válido com comentário explicativo.

5. **Documentar política de auditoria**: para cada setor, especificar quais eventos geram log,
   onde são armazenados e por quanto tempo são retidos.

## Output Format

```markdown
# Políticas de Contexto — Agentes por Setor
**Data:** {YYYY-MM-DD}

---

## Setor: {nome_setor}

### Políticas de Acesso

#### chat_agente
- **Pode iniciar:** roles: [{lista de roles}] OU usuários com setor_id = '{setor}'
- **Histórico visível:** últimos {N} dias para o próprio usuário; {visibilidade para gestor}
- **Dados visíveis ao agente:** {lista de tipos de dados que o agente pode consultar}

#### workspace
- **Pode ver:** roles: [{lista}]
- **Pode postar:** roles: [{lista}]
- **Moderação:** {quem pode apagar/editar mensagens}
- **Restrição de dados sensíveis:** {se aplicável}

#### grupos
- **Pode criar:** roles: [{lista}]
- **Pode participar (interno):** {critério}
- **Pode participar (externo ao setor):** {critério + aprovação necessária}
- **Agente no grupo:** {sim/não, com quais permissões}

### Visibilidade Executiva

| Agente Executivo | Dados Visíveis | Formato | Frequência |
|-----------------|----------------|---------|------------|
| agente_ceo | {lista de dados} | {agregado/individual} | {frequência} |
| agente_presidente | {lista} | {formato} | {frequência} |
| conselheiros | {lista} | {formato} | {frequência} |
| governanca | {lista} | {formato} | {frequência} |

### RLS Policies

```sql
-- {Descrição da policy}
CREATE POLICY "{nome_policy}" ON {tabela}
  FOR {operação}
  USING (
    {condição SQL}
  );
```

### Auditoria

| Evento | Tabela de Log | Retenção | Quem Revisa |
|--------|--------------|----------|-------------|
| {evento} | {tabela} | {N dias/meses} | {cargo} |

---
(repetir para cada setor)
```

## Output Example

> Use como referência de qualidade, não como template rígido.

```markdown
# Políticas de Contexto — Agentes por Setor
**Data:** 2026-04-07

---

## Setor: financeiro

### Políticas de Acesso

#### chat_agente
- **Pode iniciar:** roles: ['financeiro', 'contabil', 'gerencia_financeira']
- **Histórico visível:** últimos 30 dias (próprio usuário); gestor vê todo o histórico do setor
- **Dados visíveis ao agente:** lançamentos do próprio mês, DRE consolidado, contas a pagar/receber

#### workspace
- **Pode ver:** roles: ['financeiro', 'gerencia_financeira'] — contabil vê apenas workspace próprio
- **Pode postar:** roles: ['financeiro']
- **Moderação:** gerencia_financeira pode arquivar mensagens; ninguém pode excluir (auditoria)
- **Restrição de dados sensíveis:** valores acima de R$50.000 visíveis apenas para role = 'gerencia_financeira'

#### grupos
- **Pode criar:** role = 'gerencia_financeira' somente
- **Pode participar (interno):** qualquer role do setor financeiro
- **Pode participar (externo):** role = 'contabil' com aprovação da gerência financeira
- **Agente no grupo:** sim, como observador — pode responder perguntas diretas, não pode postar proativamente

### Visibilidade Executiva

| Agente Executivo | Dados Visíveis | Formato | Frequência |
|-----------------|----------------|---------|------------|
| agente_ceo | Faturamento mensal, inadimplência %, fluxo de caixa resumido | Agregado mensal | Mensal + alertas críticos |
| agente_presidente | Mesmos dados do CEO + DRE simplificado | Agregado mensal | Mensal |
| conselheiros | DRE completo, balanço trimestral | Agregado trimestral | Trimestral |
| governanca | Logs de auditoria de acesso | Logs de eventos | Sob demanda |

### RLS Policies

```sql
-- Isolamento do workspace financeiro: apenas roles autorizados
CREATE POLICY "financeiro_workspace_isolation" ON workspace_messages
  FOR ALL
  USING (
    setor_id = (SELECT id FROM sectors WHERE slug = 'financeiro')
    AND auth.jwt()->>'role' = ANY(ARRAY['financeiro', 'gerencia_financeira'])
  );

-- Mascaramento de valores sensíveis para roles não-gerência
CREATE POLICY "financeiro_amount_visibility" ON financial_entries
  FOR SELECT
  USING (
    CASE
      WHEN amount >= 50000 THEN auth.jwt()->>'role' = 'gerencia_financeira'
      ELSE auth.jwt()->>'setor_id' = setor_id::text
    END
  );

-- Visibilidade executiva: apenas summaries mensais para CEO
CREATE POLICY "ceo_financial_summary_only" ON financial_monthly_summaries
  FOR SELECT
  USING (
    auth.jwt()->>'role' = ANY(ARRAY['agente_ceo', 'agente_presidente', 'gerencia_top'])
  );
```

### Auditoria

| Evento | Tabela de Log | Retenção | Quem Revisa |
|--------|--------------|----------|-------------|
| Acesso a dados acima de R$50k | audit_financial_access | 2 anos | Gerência Financeira + Governança |
| Tentativa de acesso negado por RLS | audit_access_denied | 1 ano | TI + Governança |
| Exportação de dados financeiros | audit_data_export | 2 anos | Gerência Financeira |
```

## Quality Criteria

- [ ] Políticas para os 3 tipos de contexto (chat, workspace, grupos) definidas para cada setor
- [ ] Visibilidade executiva especificada para todos os 4 agentes (CEO, Presidente, Conselheiros, Governança)
- [ ] RLS policies em SQL válido com comentários explicativos
- [ ] Setores sensíveis (rh, financeiro, contabil) têm restrições adicionais documentadas
- [ ] Política de auditoria com tabela de eventos, retenção e responsável por revisão

## Veto Conditions

Rejeitar e refazer se QUALQUER condição for verdadeira:
1. Algum setor não tem políticas para os 3 tipos de contexto definidas
2. Visibilidade executiva não está especificada para agente_ceo (mínimo obrigatório)
