import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

export const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  full_name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  role: z.enum(['master_admin', 'admin', 'manager', 'operator', 'viewer']),
  sector_id: z.string().uuid('Setor inválido').nullable(),
  phone: z.string().nullable().optional(),
});

export const updateUserSchema = z.object({
  full_name: z.string().min(2).optional(),
  role: z.enum(['master_admin', 'admin', 'manager', 'operator', 'viewer']).optional(),
  sector_id: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  phone: z.string().nullable().optional(),
});

export const createGroupSchema = z.object({
  name: z.string().min(2, 'Nome do grupo deve ter pelo menos 2 caracteres'),
  description: z.string().nullable().optional(),
  sector_id: z.string().uuid().nullable().optional(),
  member_ids: z.array(z.string().uuid()).min(1, 'Grupo deve ter pelo menos 1 membro'),
});

export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  content: z.string().min(1, 'Mensagem não pode ser vazia').max(10000),
  content_type: z.enum(['text', 'system', 'file', 'image']).default('text'),
  reply_to_id: z.string().uuid().nullable().optional(),
});

export const createSectorSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9_]+$/, 'Slug deve conter apenas letras minúsculas, números e underscore'),
  description: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
});

export const ingestDocumentSchema = z.object({
  sector_id: z.string().uuid(),
  title: z.string().min(2),
  content: z.string().min(1),
  doc_type: z.enum(['transcript', 'document', 'procedure', 'manual', 'note', 'other']),
  tags: z.array(z.string()).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateSectorInput = z.infer<typeof createSectorSchema>;
export type IngestDocumentInput = z.infer<typeof ingestDocumentSchema>;
