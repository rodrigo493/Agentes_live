# Arquitetura de Integração ERP Nomus

## Estado: PLANEJADO (não implementado)

## Visão Geral

```
NOMUS (ERP)                    SQUADOS
===========                    =======

Pedidos de Venda ──sync──►  Painel Operacional (status por setor)
                               │
Ordens de Produção ──sync──►  Fluxo Produtivo (etapa atual)
                               │
Estoque ──sync──────────►  Alertas de estoque → Agente Compras
                               │
NF-e ──sync─────────────►  Expedição (rastreamento)
                               │
Financeiro ──sync───────►  Agente Financeiro (contexto)
```

## Estratégia de Integração

### Fase 1: Leitura (Nomus → SquadOS)
- API REST do Nomus (polling a cada 5 min)
- Dados entram como knowledge_docs nos setores relevantes
- Agentes ganham contexto operacional real

### Fase 2: Status (SquadOS → Nomus)
- Atualização de status de produção por setor
- Apontamento de horas por etapa
- Registro de não-conformidades

### Fase 3: Bidirecional
- Criação de ordens de produção a partir do SquadOS
- Movimentação de estoque
- Emissão de NF-e

## Pontos de Integração por Setor

| Setor | Dados do Nomus | Uso no SquadOS |
|-------|---------------|----------------|
| Comercial | Pedidos de venda | Contexto do agente, funil de vendas |
| Compras | Estoque, fornecedores | Alertas de estoque mínimo |
| Engenharia | Lista de materiais | Validação de projeto |
| Produção (todos) | Ordens de produção | Status em tempo real |
| Expedição | NF-e, rastreamento | Status de entrega |
| Financeiro | Contas a pagar/receber | Contexto do agente |

## Tabelas Futuras (não criadas)

- `erp_sync_config` — configuração da sincronização
- `erp_sync_log` — log de cada sincronização
- `erp_orders` — cache local de pedidos
- `erp_production_orders` — cache local de OPs
- `erp_inventory` — snapshot de estoque

## Decisões Arquiteturais

1. **Cache local** — SquadOS mantém cópia dos dados do Nomus para não depender de disponibilidade
2. **Fonte de verdade** — Nomus é a fonte de verdade para dados financeiros e fiscais
3. **Enriquecimento** — SquadOS enriquece dados do Nomus com contexto de IA (agentes, memória)
4. **Sem duplicação** — Não recriar funcionalidades do ERP no SquadOS
