import type { UserRole } from '@/shared/types/database';
import { hasMinRole, isAdmin } from './roles';

export type ResourceAction = 'read' | 'write' | 'manage' | 'admin';

export type Resource =
  | 'users'
  | 'sectors'
  | 'groups'
  | 'permissions'
  | 'chat_agent'
  | 'workspace'
  | 'knowledge'
  | 'memory'
  | 'audit'
  | 'settings'
  | 'executive_panel'
  | 'ingestion'
  | 'audio_monitoring'
  | 'vision_monitoring'
  | 'production';

interface PermissionRule {
  minRole: UserRole;
  sectorScoped?: boolean; // true = user can only access own sector
}

// Permission matrix — CAMADA 3 (API level)
const PERMISSION_MATRIX: Record<Resource, Record<ResourceAction, PermissionRule>> = {
  users: {
    read: { minRole: 'operator', sectorScoped: true },
    write: { minRole: 'admin' },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  sectors: {
    read: { minRole: 'viewer' },
    write: { minRole: 'admin' },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  groups: {
    read: { minRole: 'operator' },
    write: { minRole: 'admin' },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  permissions: {
    read: { minRole: 'admin' },
    write: { minRole: 'admin' },
    manage: { minRole: 'master_admin' },
    admin: { minRole: 'master_admin' },
  },
  chat_agent: {
    read: { minRole: 'operator', sectorScoped: true },
    write: { minRole: 'operator', sectorScoped: true },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  workspace: {
    read: { minRole: 'viewer' },
    write: { minRole: 'operator' },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  knowledge: {
    read: { minRole: 'operator', sectorScoped: true },
    write: { minRole: 'manager', sectorScoped: true },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  memory: {
    read: { minRole: 'operator', sectorScoped: true },
    write: { minRole: 'operator', sectorScoped: true },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  audit: {
    read: { minRole: 'admin' },
    write: { minRole: 'admin' },
    manage: { minRole: 'master_admin' },
    admin: { minRole: 'master_admin' },
  },
  settings: {
    read: { minRole: 'operator' },
    write: { minRole: 'operator' },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  executive_panel: {
    read: { minRole: 'master_admin' },
    write: { minRole: 'master_admin' },
    manage: { minRole: 'master_admin' },
    admin: { minRole: 'master_admin' },
  },
  ingestion: {
    read: { minRole: 'manager', sectorScoped: true },
    write: { minRole: 'manager', sectorScoped: true },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  audio_monitoring: {
    read: { minRole: 'manager', sectorScoped: true },
    write: { minRole: 'admin' },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  vision_monitoring: {
    read: { minRole: 'manager', sectorScoped: true },
    write: { minRole: 'admin' },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
  production: {
    read: { minRole: 'viewer' },
    write: { minRole: 'admin' },
    manage: { minRole: 'admin' },
    admin: { minRole: 'master_admin' },
  },
};

export function canAccess(
  userRole: UserRole,
  resource: Resource,
  action: ResourceAction
): boolean {
  const rule = PERMISSION_MATRIX[resource]?.[action];
  if (!rule) return false;
  return hasMinRole(userRole, rule.minRole);
}

export function isSectorScoped(
  resource: Resource,
  action: ResourceAction
): boolean {
  const rule = PERMISSION_MATRIX[resource]?.[action];
  return rule?.sectorScoped ?? false;
}

export function canAccessSector(
  userRole: UserRole,
  userSectorId: string | null,
  targetSectorId: string,
  resource: Resource,
  action: ResourceAction
): boolean {
  if (!canAccess(userRole, resource, action)) return false;
  if (isAdmin(userRole)) return true;
  if (isSectorScoped(resource, action)) {
    return userSectorId === targetSectorId;
  }
  return true;
}
