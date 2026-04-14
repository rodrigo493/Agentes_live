# Plan: Sistema de Tarefas na Página Produção

**Data:** 2026-04-12  
**Status:** Em execução

## Fase 1 — Banco de Dados
- `00021_create_production_tasks.sql`: tabelas `production_tasks` + `production_task_completions`, RLS

## Fase 2 — Tipos e Actions
- `database.ts`: tipos `ProductionTask`, `ProductionTaskCompletion`
- `task-actions.ts`: getMyTasksAction, getTasksForUserAction, createTaskAction, updateTaskAction, deleteTaskAction, completeTaskAction, uncompleteTaskAction, getAllUsersTaskStatsAction

## Fase 3 — Componente TaskFlowSection
- `task-flow-section.tsx`: 3 linhas (Diárias/Semanais/Únicas), nós com setas, modal criar/editar, marcar conclusão, botão Repetir

## Fase 4 — Atualizar production-shell + página
- Adicionar TaskFlowSection abaixo do fluxo de processos
- Adicionar seção admin de multi-seleção de usuários
- Atualizar `producao/page.tsx` para passar dados de tarefas

## Fase 5 — Página do usuário
- `producao/usuario/[id]/page.tsx`: view isolada de tarefas por usuário

## Fase 6 — Dashboard
- Adicionar stats de tarefas globais
- Seletor de usuário para drill-down
