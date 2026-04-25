-- ============================================================
-- Seed: Primeira Missão Piloto
-- Associa a missão à Live Equipamentos e à Laivinha Orquestradora
-- usando subqueries para não depender de IDs hardcoded
-- ============================================================

WITH ids AS (
  SELECT
    (SELECT id FROM organizacoes  WHERE nome = 'Live Equipamentos')       AS id_org,
    (SELECT id FROM agentes_config WHERE nome = 'Laivinha Orquestradora') AS id_agente
)
INSERT INTO missoes (
  id_da_organizacao,
  id_do_responsavel,
  titulo,
  descricao,
  status
)
VALUES (
  (SELECT id_org    FROM ids),
  (SELECT id_agente FROM ids),
  'Análise Competitiva — V5 Reformer no Mercado Americano',
  'Criar um relatório de análise competitiva detalhado sobre o principal concorrente do V5 Reformer no mercado dos EUA. Objetivo: entender pontos fortes, fracos, estratégia de preço e percepção do cliente para informar a estratégia de go-to-market.',
  'Planejamento'
);
