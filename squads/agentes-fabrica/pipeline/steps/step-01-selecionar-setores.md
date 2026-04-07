---
type: checkpoint
outputFile: squads/agentes-fabrica/output/setores-selecionados.md
---

# Checkpoint — Selecionar Setores para Esta Rodada

Este squad opera sobre os 17 setores do sistema interno da Live Universe. Em cada rodada, você
pode processar todos os setores ou um subconjunto — dependendo do foco atual do desenvolvimento.

**Empresa:** Live Universe — Fabricante de equipamentos de Pilates e funcional

---

## Setores Disponíveis

**Operacionais (Fábrica):**
1. `solda` — Setor de soldagem
2. `inspecao_qualidade_solda` — Inspeção de qualidade da solda
3. `lavagem` — Setor de lavagem de peças
4. `pintura` — Setor de pintura
5. `inspecao_qualidade_pintura` — Inspeção de qualidade da pintura
6. `montagem` — Montagem dos equipamentos
7. `expedicao` — Expedição e logística

**Suporte à Operação:**
8. `compras` — Gestão de compras e fornecedores
9. `engenharia` — Engenharia de produto e processo
10. `assistencia_tecnica` — Assistência técnica pós-venda

**Comercial e Relacionamento:**
11. `comercial` — Vendas e gestão de clientes
12. `marketing` — Marketing e comunicação
13. `pos_venda` — Pós-venda e sucesso do cliente

**Administrativo e Financeiro:**
14. `financeiro` — Financeiro e gestão de caixa
15. `contabil` — Contabilidade e fiscal
16. `administrativo` — Administração geral
17. `rh` — Recursos humanos

---

## Pergunta

Quais setores devem ser processados nesta rodada?

**Opções:**
1. **Todos os 17 setores** — rodada completa (mais tempo, mais detalhado)
2. **Apenas operacionais (7 setores)** — solda, inspeção solda, lavagem, pintura, inspeção pintura, montagem, expedição
3. **Apenas administrativos e financeiros (4 setores)** — financeiro, contábil, administrativo, RH
4. **Seleção personalizada** — informe quais setores você quer processar

Se escolher "Seleção personalizada", liste os slugs desejados (ex: `solda, marketing, rh`).
