# Design: Aba Pesquisas no SquadOS

**Data:** 2026-04-17  
**Status:** Aprovado  
**Abordagem escolhida:** B — campo `category` no ingest-meeting

---

## Problema

As pesquisas estratégicas diárias geradas pelo `pesquisa-diaria.py` (VPS) chegam ao SquadOS como `knowledge_docs`, mas ficam misturadas com outros documentos na Base de Conhecimento. Não há uma interface dedicada para o usuário visualizá-las de forma organizada.

---

## Solução

Criar a rota `/pesquisas` no SquadOS com listagem de cards filtrada por `category = 'pesquisa_diaria'`, com drawer para leitura do conteúdo completo.

---

## Arquitetura

4 mudanças isoladas:

| Arquivo | Mudança |
|---|---|
| `src/app/api/ingest-meeting/route.ts` | Aceita `category` opcional no body, salva em `knowledge_docs.category` |
| `pesquisa-diaria.py` (VPS) | Adiciona `"category": "pesquisa_diaria"` no payload |
| `src/config/navigation.ts` | Novo item: Pesquisas → `/pesquisas`, icon TrendingUp, minRole operator |
| `src/app/(app)/pesquisas/page.tsx` | Server Component + Client Drawer |

Nenhuma migration necessária — coluna `category` já existe em `knowledge_docs`.

---

## Fluxo de Dados

**Publicação:**
```
pesquisa-diaria.py (VPS, cron 10:00 UTC)
  └─ POST /api/ingest-meeting
       { sector_slug: "presidencia", category: "pesquisa_diaria", doc_type: "document", title, content }
  └─ knowledge_docs INSERT com category = "pesquisa_diaria"
```

**Visualização:**
```
/pesquisas (Server Component)
  └─ SELECT knowledge_docs
       WHERE category = 'pesquisa_diaria'
       AND sector_id = profile.active_sector_id
       ORDER BY created_at DESC
  └─ Grid de cards → click → PesquisaDrawer (Client Component)
```

---

## UI

### Página `/pesquisas`
- Header: "Pesquisas Estratégicas" + badge com total de pesquisas
- Pills de filtro por tema (todos selecionados por padrão)
- Grid responsivo: 3 colunas desktop, 2 tablet, 1 mobile
- Cada card: badge colorido do tema, título, data, 3 linhas truncadas do conteúdo, botão "Ler"

### Cards — mapa de cores por tema
| Tema | Cor |
|---|---|
| MERCADO | azul |
| COMPETITIVA | vermelho |
| TECNICA / IPS | roxo |
| MA (M&A) | verde |
| ESTRATEGIA | laranja |
| REGULATORIA | amarelo |
| EXPANSAO | ciano |

Tema extraído do `title` (ex: "Pesquisa Diaria MERCADO - 2026-04-17" → "MERCADO").

### Drawer
- Slide da direita: 40% largura desktop / full mobile
- Header: título + data + badge do tema
- Corpo: conteúdo completo em markdown (usar `prose` do Tailwind Typography se disponível, ou `whitespace-pre-wrap`)
- Botão fechar no topo direito

---

## Componentes

- `pesquisas/page.tsx` — Server Component, busca dados, passa para client
- `pesquisas/_components/pesquisas-grid.tsx` — Client Component com estado de filtro e drawer
- `pesquisas/_components/pesquisa-card.tsx` — Card individual (pode ser server ou client)
- `pesquisas/_components/pesquisa-drawer.tsx` — Drawer com conteúdo completo

---

## Fora do Escopo

- Roteamento por setor (tudo vai para presidência por ora)
- Busca full-text dentro das pesquisas
- Paginação (limite de 50 documentos por query é suficiente inicialmente)
