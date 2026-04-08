/**
 * Tipos para integração com ERP Nomus
 *
 * ESTADO: Apenas contratos TypeScript — sem implementação operacional.
 * OBJETIVO: Definir estrutura de dados para futura sincronização.
 *
 * Integração planejada:
 * - Nomus API REST ou webhooks
 * - Sync unidirecional inicialmente (Nomus → SquadOS)
 * - Bidirecional futuro para status de produção
 */

// ===== Pedidos de Venda =====

export interface NomusOrder {
  id: string;                        // ID no Nomus
  order_number: string;              // Número do pedido (ex: PV-2026-0142)
  customer_name: string;
  customer_document: string;         // CNPJ/CPF
  status: NomusOrderStatus;
  priority: 'normal' | 'urgent' | 'scheduled';
  order_date: string;                // Data do pedido
  delivery_date: string | null;      // Data prometida de entrega
  shipped_date: string | null;       // Data de expedição
  items: NomusOrderItem[];
  total_value: number;
  payment_condition: string;
  notes: string | null;
  nfe_number: string | null;         // Nota fiscal
  nfe_key: string | null;            // Chave da NF-e
  tracking_code: string | null;      // Código de rastreio
  carrier: string | null;            // Transportadora
  salesperson: string | null;        // Vendedor responsável
}

export type NomusOrderStatus =
  | 'draft'           // Rascunho
  | 'confirmed'       // Confirmado
  | 'in_production'   // Em produção
  | 'ready'           // Pronto para expedição
  | 'shipped'         // Expedido
  | 'delivered'       // Entregue
  | 'cancelled';      // Cancelado

export interface NomusOrderItem {
  product_code: string;              // Código do produto (ex: REF-CLASSIC-001)
  product_name: string;              // Nome do produto
  quantity: number;
  unit_price: number;
  color: string | null;              // Cor escolhida
  customizations: string | null;     // Personalizações
  production_status: ProductionStatus;
}

export type ProductionStatus =
  | 'pending'         // Aguardando produção
  | 'cutting'         // Corte
  | 'welding'         // Solda
  | 'washing'         // Lavagem
  | 'painting'        // Pintura
  | 'upholstery'      // Tapeçaria
  | 'assembly'        // Montagem
  | 'quality_check'   // Inspeção final
  | 'ready'           // Pronto
  | 'shipped';        // Expedido

// ===== Estoque =====

export interface NomusInventoryItem {
  product_code: string;
  product_name: string;
  category: 'raw_material' | 'component' | 'finished_product' | 'consumable';
  current_stock: number;
  min_stock: number;                 // Estoque mínimo
  max_stock: number;                 // Estoque máximo
  unit: string;                      // un, kg, m, etc.
  warehouse: string;                 // Almoxarifado
  last_entry_date: string | null;
  last_exit_date: string | null;
  average_cost: number;
  supplier: string | null;
  lead_time_days: number | null;
}

export type StockAlertType =
  | 'below_minimum'    // Abaixo do estoque mínimo
  | 'above_maximum'    // Acima do estoque máximo
  | 'no_movement'      // Sem movimentação > 90 dias
  | 'expiring';        // Material com validade próxima

// ===== Produção =====

export interface NomusProductionOrder {
  id: string;
  order_number: string;              // OP-2026-0089
  sales_order_id: string | null;     // Vínculo com pedido de venda
  product_code: string;
  product_name: string;
  quantity: number;
  status: ProductionOrderStatus;
  priority: 'normal' | 'urgent';
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  current_sector: string | null;     // Setor atual no fluxo
  route: ProductionRouteStep[];      // Roteiro de fabricação
  notes: string | null;
}

export type ProductionOrderStatus =
  | 'planned'          // Planejada
  | 'released'         // Liberada
  | 'in_progress'      // Em execução
  | 'paused'           // Pausada
  | 'completed'        // Concluída
  | 'cancelled';       // Cancelada

export interface ProductionRouteStep {
  step: number;
  sector_slug: string;               // Mapeia para setor do SquadOS
  operation: string;                 // Descrição da operação
  planned_hours: number;
  actual_hours: number | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  operator: string | null;
  notes: string | null;
}

// ===== Financeiro =====

export interface NomusFinancialEntry {
  id: string;
  type: 'receivable' | 'payable';
  document_number: string;
  counterpart: string;               // Cliente ou fornecedor
  value: number;
  due_date: string;
  payment_date: string | null;
  status: 'open' | 'paid' | 'overdue' | 'cancelled';
  category: string;
  cost_center: string | null;
}

// ===== Sincronização =====

export interface NomusSyncConfig {
  api_base_url: string;
  api_key: string;
  sync_interval_minutes: number;
  enabled_modules: NomusSyncModule[];
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | 'partial';
  last_sync_error: string | null;
}

export type NomusSyncModule =
  | 'orders'           // Pedidos de venda
  | 'production'       // Ordens de produção
  | 'inventory'        // Estoque
  | 'financial'        // Financeiro
  | 'nfe';             // Notas fiscais

/**
 * Mapeamento Setor SquadOS ↔ Etapa Nomus
 *
 * Este mapeamento conecta o fluxo produtivo do SquadOS
 * com as etapas de produção do ERP Nomus.
 */
export const SECTOR_TO_PRODUCTION_STAGE: Record<string, ProductionStatus> = {
  comercial: 'pending',
  engenharia: 'pending',
  compras: 'pending',
  solda: 'welding',
  inspecao_qualidade_solda: 'welding',
  lavagem: 'washing',
  pintura: 'painting',
  inspecao_qualidade_pintura: 'painting',
  tapecaria: 'upholstery',
  montagem: 'assembly',
  expedicao: 'shipped',
};
